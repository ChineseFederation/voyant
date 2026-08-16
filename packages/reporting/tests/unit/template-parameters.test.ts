import { reportTemplateDefinitionSchema } from "@voyant-travel/reporting-contracts"
import { describe, expect, it, vi } from "vitest"

import { ReportingRegistry } from "../../src/registry.js"
import { createReportingService } from "../../src/service.js"

/**
 * A template that needs a reporting period has to be able to say so, and an
 * operator adding it has to land on something that renders (voyant#4704).
 */

const periodTemplate = {
  id: "finance.unperformed-services",
  version: 1,
  label: "Contracts in progress",
  parameters: [
    { id: "periodStart", label: "Period start", valueType: "date" as const, required: true },
    {
      id: "periodEnd",
      label: "Period end",
      valueType: "date" as const,
      required: true,
      defaultValue: "2026-08-31",
    },
  ],
  widgets: [
    {
      id: "lines",
      source: { kind: "preset" as const, widgetId: "finance.lines", version: 1 },
      layout: { x: 0, y: 0, width: 12, height: 6 },
    },
  ],
}

function registryWithTemplate() {
  return new ReportingRegistry([
    {
      namespace: "finance",
      widgets: [
        {
          id: "finance.lines",
          version: 1,
          label: "Lines",
          query: {
            dataset: { id: "finance.unperformed-services", version: 1 },
            select: [{ kind: "aggregate", operation: "count", as: "n" }],
            filters: [],
            groupBy: [],
            orderBy: [],
          },
          visualization: { type: "table", options: {} },
          defaultSize: { width: 12, height: 6 },
        },
      ],
      templates: [periodTemplate],
    },
  ])
}

describe("template parameters", () => {
  it("describes a parameter rather than only naming it", () => {
    const parsed = reportTemplateDefinitionSchema.parse(periodTemplate)
    // A bare name cannot be rendered as an input: nothing downstream could tell
    // that `periodStart` wants a date, what to label it, or that the report
    // means nothing without it.
    expect(parsed.parameters[0]).toMatchObject({
      id: "periodStart",
      label: "Period start",
      valueType: "date",
      required: true,
    })
  })

  it("rejects a template that declares the same parameter twice", () => {
    const duplicated = {
      ...periodTemplate,
      parameters: [
        { id: "periodStart", label: "One", valueType: "date" as const },
        { id: "periodStart", label: "Two", valueType: "date" as const },
      ],
    }
    expect(reportTemplateDefinitionSchema.safeParse(duplicated).success).toBe(false)
  })

  it("seeds declared defaults when an operator adds the template to their reports", async () => {
    const service = createReportingService(registryWithTemplate())
    const created = vi.fn(async (input: unknown) => input)
    const db = {} as never
    const spy = vi.spyOn(service, "create").mockImplementation(created as never)

    await service.instantiateTemplate(
      db,
      { templateId: "finance.unperformed-services", name: "August return" },
      "user_1",
    )

    // Without this an instantiated period report opens with every widget in a
    // missing-parameter error, which reads as a broken template rather than as
    // "choose a period".
    expect(created).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        sourceTemplateId: "finance.unperformed-services",
        draft: expect.objectContaining({ parameters: { periodEnd: "2026-08-31" } }),
      }),
      "user_1",
    )
    spy.mockRestore()
  })
})
