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

  it("exposes bounded operational SLA and workload measures", async () => {
    let statement: SQL | undefined
    const execute = vi.fn(async (query: SQL) => {
      statement = query
      return [{ report_column_0: "12.5", report_column_1: "1" }]
    })
    const result = await inquiryActivityDataset.execute(
      { db: { execute }, grantedScopes: ["crm:read"] },
      {
        query: {
          dataset: { id: INQUIRY_ACTIVITY_DATASET_ID },
          select: [
            {
              kind: "aggregate",
              operation: "average",
              field: "firstResponseMinutes",
              as: "averageResponseMinutes",
            },
            { kind: "aggregate", operation: "sum", field: "overdueCount", as: "overdue" },
          ],
          filters: [],
          groupBy: [],
          orderBy: [],
        },
        parameters: {},
        maximumRows: 1,
      },
    )
    expect(result.columns).toEqual([
      { id: "averageResponseMinutes", label: "averageResponseMinutes", valueType: "number" },
      { id: "overdue", label: "overdue", valueType: "integer" },
    ])
    expect(result.rows).toEqual([{ averageResponseMinutes: 12.5, overdue: 1 }])
    const compiled = new PgDialect().sqlToQuery(statement!)
    expect(compiled.sql).toContain('"inquiries"."first_responded_at"')
    expect(compiled.sql).toContain('"inquiries"."next_action_at"')
  })

  it("rejects invalid filter types and operators before querying Postgres", async () => {
    const execute = vi.fn()
    const input = {
      query: {
        dataset: { id: INQUIRY_ACTIVITY_DATASET_ID },
        select: [{ kind: "field" as const, field: "status" }],
        filters: [
          {
            field: "status",
            operator: "greaterThan" as const,
            value: { kind: "literal" as const, value: "new" },
          },
        ],
        groupBy: [],
        orderBy: [],
      },
      parameters: {},
      maximumRows: 10,
    }
    await expect(
      inquiryActivityDataset.execute({ db: { execute }, grantedScopes: ["crm:read"] }, input),
    ).rejects.toThrow("greaterThan is not supported for string fields")
    expect(execute).not.toHaveBeenCalled()
  })

  it("counts elapsed unanswered deadlines in the SLA denominator", async () => {
    let statement: SQL | undefined
    const execute = vi.fn(async (query: SQL) => {
      statement = query
      return [{ report_column_0: "1" }]
    })
    await inquiryActivityDataset.execute(
      { db: { execute }, grantedScopes: ["crm:read"] },
      {
        query: {
          dataset: { id: INQUIRY_ACTIVITY_DATASET_ID },
          select: [
            {
              kind: "aggregate",
              operation: "sum",
              field: "firstResponseSlaEligibleCount",
              as: "eligible",
            },
          ],
          filters: [],
          groupBy: [],
          orderBy: [],
        },
        parameters: {},
        maximumRows: 1,
      },
    )
    expect(new PgDialect().sqlToQuery(statement!).sql).toContain(
      '"inquiries"."first_response_due_at" <= now()',
    )
  })

  it("rejects between on unordered fields before querying", async () => {
    const execute = vi.fn()
    await expect(
      inquiryActivityDataset.execute(
        { db: { execute }, grantedScopes: ["crm:read"] },
        {
          query: {
            dataset: { id: INQUIRY_ACTIVITY_DATASET_ID },
            select: [{ kind: "field", field: "status" }],
            filters: [
              {
                field: "status",
                operator: "between",
                value: { kind: "literal", value: ["new", "triaged"] },
              },
            ],
            groupBy: [],
            orderBy: [],
          },
          parameters: {},
          maximumRows: 1,
        },
      ),
    ).rejects.toThrow("between is not supported for string fields")
    expect(execute).not.toHaveBeenCalled()
  })
})
