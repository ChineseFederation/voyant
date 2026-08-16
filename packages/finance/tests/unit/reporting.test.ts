import {
  reportDatasetDefinitionSchema,
  reportTemplateDefinitionSchema,
  reportWidgetDefinitionSchema,
} from "@voyant-travel/reporting-contracts"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import {
  compileFinanceReceivablesQuery,
  FinanceReportingQueryError,
  financeReceivablesDataset,
} from "../../src/reporting.js"
import {
  financeReceivablesDatasetDefinition,
  financeReportingTemplates,
  financeReportingWidgets,
} from "../../src/reporting-definitions.js"

const groupedOutstandingQuery = {
  dataset: { id: "finance.receivables", version: 1 },
  select: [
    { kind: "field" as const, field: "currency" },
    {
      kind: "aggregate" as const,
      operation: "sum" as const,
      field: "outstandingBalanceCents",
      as: "outstandingBalanceCents",
    },
  ],
  filters: [],
  groupBy: [{ field: "currency" }],
  orderBy: [{ by: "outstandingBalanceCents", direction: "descending" as const }],
  limit: 20,
}

/**
 * Each dataset names the dimension its money columns are denominated by. The
 * rule below is per dataset, not per package — a second dataset does not get to
 * skip it, and does not have to borrow the first one's dimension name.
 */
const CURRENCY_DIMENSION_BY_DATASET: Readonly<Record<string, string>> = {
  "finance.receivables": "currency",
  "finance.unperformed-services": "reportingCurrency",
}

describe("Finance reporting definitions", () => {
  it("publishes contract-valid dataset, widget, and template definitions", () => {
    expect(reportDatasetDefinitionSchema.parse(financeReceivablesDatasetDefinition).id).toBe(
      "finance.receivables",
    )
    for (const widget of financeReportingWidgets) {
      expect(reportWidgetDefinitionSchema.safeParse(widget)).toMatchObject({ success: true })
      // A widget over a dataset nobody contributes is a preset that can only
      // ever render an error.
      expect(Object.keys(CURRENCY_DIMENSION_BY_DATASET)).toContain(widget.query.dataset.id)
    }
    for (const template of financeReportingTemplates) {
      expect(reportTemplateDefinitionSchema.safeParse(template)).toMatchObject({ success: true })
    }
  })

  it("keeps every contributed monetary preset partitioned by its dataset's currency", () => {
    const monetaryWidgets = financeReportingWidgets.filter((widget) =>
      widget.query.select.some(
        (selection) => selection.kind === "aggregate" && selection.operation === "sum",
      ),
    )

    expect(monetaryWidgets).not.toHaveLength(0)
    for (const widget of monetaryWidgets) {
      const currency = CURRENCY_DIMENSION_BY_DATASET[widget.query.dataset.id]
      expect(widget.query.groupBy.some((group) => group.field === currency)).toBe(true)
      // Without both, a renderer has no way to tell whether 351533 is 351,533
      // or 3,515.33, nor which currency it is in.
      expect(widget.visualization.options.minorUnit).toBe(true)
      expect(widget.visualization.options.currencyField).toBe(currency)
    }
  })
})

describe("Finance receivables query compiler", () => {
  it("compiles the explicit invoice, credit-note, and collection semantics", () => {
    const compiled = compileFinanceReceivablesQuery({
      query: groupedOutstandingQuery,
      parameters: {},
      maximumRows: 100,
    })
    const query = new PgDialect().sqlToQuery(compiled.statement)

    expect(query.sql).toContain("invoice.invoice_type = 'invoice'")
    expect(query.sql).toContain("invoice.status IN ('issued', 'partially_paid', 'paid', 'overdue')")
    expect(query.sql).toContain("credit.status IN ('issued', 'applied')")
    expect(query.sql).toContain("payment.status = 'completed'")
    expect(query.sql).toContain("payment.status = 'refunded'")
    expect(query.sql).toContain("GROUP BY receivable.currency")
    expect(query.params.at(-1)).toBe(21)
  })

  it("rejects aggregating money across currencies", () => {
    expect(() =>
      compileFinanceReceivablesQuery({
        query: {
          ...groupedOutstandingQuery,
          select: [
            {
              kind: "aggregate",
              operation: "sum",
              field: "outstandingBalanceCents",
              as: "outstandingBalanceCents",
            },
          ],
          groupBy: [],
        },
        parameters: {},
        maximumRows: 100,
      }),
    ).toThrow("include or group by currency")
  })

  it("allows a single parameter-bound currency and rejects unsupported measure filters", () => {
    const compiled = compileFinanceReceivablesQuery({
      query: {
        ...groupedOutstandingQuery,
        select: [
          {
            kind: "aggregate",
            operation: "sum",
            field: "outstandingBalanceCents",
            as: "outstandingBalanceCents",
          },
        ],
        filters: [
          {
            field: "currency",
            operator: "equal",
            value: { kind: "parameter", name: "currency" },
          },
        ],
        groupBy: [],
      },
      parameters: { currency: "RON" },
      maximumRows: 100,
    })
    expect(new PgDialect().sqlToQuery(compiled.statement).params).toContain("RON")

    expect(() =>
      compileFinanceReceivablesQuery({
        query: {
          ...groupedOutstandingQuery,
          filters: [
            {
              field: "outstandingBalanceCents",
              operator: "greaterThan",
              value: { kind: "literal", value: 0 },
            },
          ],
        },
        parameters: {},
        maximumRows: 100,
      }),
    ).toThrow(FinanceReportingQueryError)
  })

  it("names an output column after the author's alias, keeping the field label for a restated one", () => {
    const compiled = compileFinanceReceivablesQuery({
      query: {
        ...groupedOutstandingQuery,
        select: [
          { kind: "field", field: "currency" },
          {
            kind: "aggregate",
            operation: "sum",
            field: "outstandingBalanceCents",
            as: "owed",
          },
        ],
        orderBy: [],
      },
      parameters: {},
      maximumRows: 100,
    })

    expect(compiled.columns).toEqual([
      { id: "currency", label: "Document currency", valueType: "string" },
      {
        id: "owed",
        label: "owed",
        valueType: "currency",
        minorUnit: true,
        currencyField: "currency",
      },
    ])

    // The query language requires an alias on every aggregate, so one that
    // restates the field id is not a name the author chose.
    expect(
      compileFinanceReceivablesQuery({
        query: groupedOutstandingQuery,
        parameters: {},
        maximumRows: 100,
      }).columns.at(-1),
    ).toMatchObject({ id: "outstandingBalanceCents", label: "Outstanding balance" })
  })

  it("declares money columns as minor-unit, and names their currency column only when selected", () => {
    const withoutCurrency = compileFinanceReceivablesQuery({
      query: {
        ...groupedOutstandingQuery,
        select: [
          {
            kind: "aggregate",
            operation: "sum",
            field: "outstandingBalanceCents",
            as: "outstandingBalanceCents",
          },
        ],
        filters: [
          { field: "currency", operator: "equal", value: { kind: "literal", value: "EUR" } },
        ],
        groupBy: [],
        orderBy: [],
      },
      parameters: {},
      maximumRows: 100,
    })

    // Filtered to one currency, so no currency column comes back in the result:
    // the scale is still known, the denomination is not, and it is left absent
    // rather than guessed.
    expect(withoutCurrency.columns).toEqual([
      {
        id: "outstandingBalanceCents",
        label: "Outstanding balance",
        valueType: "currency",
        minorUnit: true,
      },
    ])
  })

  it("rejects filters with missing parameter values", () => {
    expect(() =>
      compileFinanceReceivablesQuery({
        query: {
          ...groupedOutstandingQuery,
          filters: [
            {
              field: "currency",
              operator: "equal",
              value: { kind: "parameter", name: "currency" },
            },
          ],
        },
        parameters: {},
        maximumRows: 100,
      }),
    ).toThrow('Missing query parameter "currency"')
  })
})

describe("Finance receivables executor", () => {
  it("requires Finance read scope, normalizes numeric rows, and reports truncation", async () => {
    const execute = vi.fn().mockResolvedValue([
      { currency: "EUR", outstandingBalanceCents: "500" },
      { currency: "RON", outstandingBalanceCents: "400" },
    ])
    const input = {
      query: { ...groupedOutstandingQuery, limit: 1 },
      parameters: {},
      maximumRows: 1,
    }

    await expect(
      financeReceivablesDataset.execute({ db: { execute }, grantedScopes: [] }, input),
    ).rejects.toThrow("finance:read")

    await expect(
      financeReceivablesDataset.execute(
        { db: { execute }, grantedScopes: ["finance:read"] },
        input,
      ),
    ).resolves.toMatchObject({
      rows: [{ currency: "EUR", outstandingBalanceCents: 500 }],
      truncated: true,
    })

    await expect(
      financeReceivablesDataset.execute({ db: { execute }, grantedScopes: ["finance:*"] }, input),
    ).resolves.toMatchObject({ truncated: true })
  })
})
