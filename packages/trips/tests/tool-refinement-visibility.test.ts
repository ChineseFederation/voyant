import { describe, expect, it } from "vitest"
import { z } from "zod"

import { tripsTools } from "../src/tools.js"

/**
 * `requireTripComponentDetails` enforces two rules that live inside a free-form
 * `metadata` record, and Zod refinements are dropped by `z.toJSONSchema` — the
 * schema an MCP client shows the model when it picks arguments. Stated only as
 * a refinement, the rules are invisible until the call fails, which is the
 * shape that made create_booking loop (#3814).
 *
 * There is no field to hang the copy on inside `metadata`, so it lives on the
 * components array. These tests pin that it survives serialization.
 */
function inputJsonSchema(toolName: string) {
  const tool = tripsTools.find((candidate) => candidate.name === toolName)
  if (!tool) throw new Error(`${toolName} is not exported by tripsTools`)
  return z.toJSONSchema(tool.inputSchema, { io: "input" }) as {
    properties: Record<string, { description?: string }>
  }
}

describe("trip component rules are visible in JSON Schema", () => {
  it.each([
    ["create_trip", "components"],
    ["revise_trip", "addComponents"],
  ])("%s documents the manual-service and accommodation rules on %s", (toolName, field) => {
    const description = inputJsonSchema(toolName).properties[field]?.description ?? ""

    expect(description).toMatch(/manualService\.name/)
    expect(description).toMatch(/bookingDraftV1\.configure\.dateRange/)
    expect(description).toMatch(/checkOut/)
  })
})
