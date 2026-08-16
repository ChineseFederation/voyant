import {
  reportDatasetDefinitionSchema,
  reportTemplateDefinitionSchema,
  reportWidgetDefinitionSchema,
} from "@voyant-travel/reporting-contracts"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import {
  financeReportingTemplates,
  financeReportingWidgets,
  financeUnperformedServicesDatasetDefinition,
} from "../../src/reporting-definitions.js"
import {
  compileFinanceUnperformedServicesQuery,
  financeUnperformedServicesDataset,
} from "../../src/reporting-unperformed-services.js"

const PERIOD = { periodStart: "2026-08-01", periodEnd: "2026-08-31" }

const lineListQuery = {
  dataset: { id: "finance.unperformed-services", version: 1 },
  select: [
    { kind: "field" as const, field: "bookingNumber" },
    { kind: "field" as const, field: "reportingCurrency" },
    { kind: "field" as const, field: "contractValueReportingCents" },
  ],
  filters: [],
  groupBy: [],
  orderBy: [],
}

function compile(parameters: Record<string, unknown>, query = lineListQuery) {
  return new PgDialect().sqlToQuery(
    compileFinanceUnperformedServicesQuery({
      query,
      parameters: parameters as never,
      maximumRows: 100,
    }).statement,
  )
}

describe("unperformed services definitions", () => {
  it("declares a valid dataset, widgets, and an operator-addable template", () => {
    expect(
      reportDatasetDefinitionSchema.safeParse(financeUnperformedServicesDatasetDefinition),
    ).toMatchObject({ success: true })

    const template = financeReportingTemplates.find(
      (candidate) => candidate.id === "finance.contracts-in-progress",
    )
    expect(reportTemplateDefinitionSchema.safeParse(template)).toMatchObject({ success: true })

    // Every widget the template names has to exist, or instantiating it lands
    // the operator on a report full of missing-widget errors.
    const widgetIds = new Set(financeReportingWidgets.map((widget) => widget.id))
    for (const instance of template?.widgets ?? []) {
      expect(
        reportWidgetDefinitionSchema.safeParse(
          financeReportingWidgets.find(
            (widget) => instance.source.kind === "preset" && widget.id === instance.source.widgetId,
          ),
        ),
      ).toMatchObject({ success: true })
      if (instance.source.kind === "preset") {
        expect(widgetIds.has(instance.source.widgetId)).toBe(true)
      }
    }
  })

  it("owns its period instead of declaring a page date field", () => {
    // The page-level window is one field with both bounds; this period is two
    // fields with opposite open bounds. Declaring `defaultDateField` would let
    // the header control silently answer a different question.
    expect(financeUnperformedServicesDatasetDefinition).not.toHaveProperty("defaultDateField")

    const template = financeReportingTemplates.find(
      (candidate) => candidate.id === "finance.contracts-in-progress",
    )
    expect(template?.parameters.map((parameter) => parameter.id)).toEqual([
      "periodStart",
      "periodEnd",
    ])
    expect(template?.parameters.every((parameter) => parameter.required)).toBe(true)
  })

  it("marks the client name as PII", () => {
    const clientName = financeUnperformedServicesDatasetDefinition.fields.find(
      (field) => field.id === "clientName",
    )
    expect(clientName?.sensitivity).toBe("pii")
  })
})

describe("unperformed services compiler", () => {
  it("binds the period rather than inlining it", () => {
    const { sql, params } = compile(PERIOD)
    expect(sql).not.toContain("2026-08-01")
    expect(params).toContain("2026-08-01")
    expect(params).toContain("2026-08-31")
  })

  it("refuses a query with no period, or a backwards one", () => {
    expect(() => compile({})).toThrow(/periodStart is required/)
    expect(() => compile({ periodStart: "2026-08-01" })).toThrow(/periodEnd is required/)
    // A period report that quietly covers all time returns a plausible number
    // that is wrong by an amount nobody can see.
    expect(() => compile({ periodStart: "August", periodEnd: "2026-08-31" })).toThrow(/YYYY-MM-DD/)
    expect(() => compile({ periodStart: "2026-08-31", periodEnd: "2026-08-01" })).toThrow(
      /must not precede/,
    )
  })

  it("denominates money columns by the reporting currency the query selects", () => {
    const compiled = compileFinanceUnperformedServicesQuery({
      query: lineListQuery,
      parameters: PERIOD as never,
      maximumRows: 100,
    })
    const value = compiled.columns.find((column) => column.id === "contractValueReportingCents")
    expect(value).toMatchObject({ minorUnit: true, currencyField: "reportingCurrency" })
  })

  it("rejects a field the dataset does not declare", () => {
    expect(() =>
      compile(PERIOD, {
        ...lineListQuery,
        select: [{ kind: "field" as const, field: "bookings.sell_amount_cents" }],
      }),
    ).toThrow(/Unknown Finance field/)
  })
})

describe("unperformed services executor", () => {
  it("requires finance read scope", async () => {
    const execute = vi.fn().mockResolvedValue([])
    await expect(
      financeUnperformedServicesDataset.execute(
        { db: { execute }, grantedScopes: [] },
        { query: lineListQuery, parameters: PERIOD as never, maximumRows: 10 },
      ),
    ).rejects.toThrow("finance:read")
  })

  it("asks the relation how many contracts are unstamped, not the returned rows", async () => {
    // The executor issues the data query, then a companion count over the same
    // relation. Inspecting the returned rows cannot work: on the KPI widgets
    // they are already aggregated, so an unstamped contract leaves no null
    // behind to find.
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        { bookingNumber: "C1", reportingCurrency: "RON", contractValueReportingCents: "1000" },
        { bookingNumber: "C2", reportingCurrency: null, contractValueReportingCents: null },
      ])
      .mockResolvedValueOnce([{ unstamped: "1", total: "2" }])

    const result = await financeUnperformedServicesDataset.execute(
      { db: { execute }, grantedScopes: ["finance:read"] },
      { query: lineListQuery, parameters: PERIOD as never, maximumRows: 10 },
    )

    expect(result.rows).toEqual([
      { bookingNumber: "C1", reportingCurrency: "RON", contractValueReportingCents: 1000 },
      { bookingNumber: "C2", reportingCurrency: null, contractValueReportingCents: null },
    ])
    expect(result.warnings.join(" ")).toContain("1 of 2 contracts")
  })

  it("does not pay for a count on a figure stamping cannot shorten", async () => {
    const execute = vi.fn().mockResolvedValue([{ contracts: "3" }])

    const result = await financeUnperformedServicesDataset.execute(
      { db: { execute }, grantedScopes: ["finance:read"] },
      {
        query: {
          ...lineListQuery,
          select: [{ kind: "aggregate" as const, operation: "count" as const, as: "contracts" }],
        },
        parameters: PERIOD as never,
        maximumRows: 10,
      },
    )

    expect(result.warnings).toEqual([])
    // A contract count is complete whether or not the contract is stamped, so
    // the companion query is not issued at all.
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
