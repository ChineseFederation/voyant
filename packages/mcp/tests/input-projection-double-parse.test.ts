import { describe, expect, it } from "vitest"
import { z } from "zod"

import { toMcpInputSchema } from "../src/schema-projection.js"

/**
 * The schema registered with the MCP SDK is parsed BEFORE the tool callback
 * runs, and `dispatchToResult` then re-parses through the registry's original
 * schema. So the registered schema must not execute domain transforms: a
 * non-idempotent one corrupts the value between the two parses.
 *
 * `booleanQueryParam` is the live example — `z.enum(["true","false","1","0"])
 * .transform(...)`. If the SDK ran the transform, the callback would receive
 * `true` and the registry's enum would reject a boolean with INVALID_INPUT.
 *
 * Making `projectSchemaForMcpDiscovery` probe with `io: "input"` (symmetrical
 * with the registry manifest fix, and superficially the obvious thing to do)
 * reintroduces exactly that. This test exists to catch it.
 */
const booleanQueryParam = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1")

const entry = {
  name: "probe",
  description: "Probe tool.",
  capabilityId: "test#tool.probe",
  capabilityVersion: "v1",
  aliases: [],
} as unknown as Parameters<typeof toMcpInputSchema>[1]

describe("MCP-registered input schema", () => {
  it("does not execute a domain transform during the SDK's parse", () => {
    const schema = toMcpInputSchema(z.object({ active: booleanQueryParam.optional() }), entry)
    const parsed = schema.parse({ active: "true" }) as { active?: unknown }

    // The wire value must survive intact for the registry's own parse.
    expect(parsed.active).toBe("true")
    expect(parsed.active).not.toBe(true)
  })

  it("still accepts every value the domain schema accepts", () => {
    const schema = toMcpInputSchema(z.object({ active: booleanQueryParam.optional() }), entry)

    for (const value of ["true", "false", "1", "0"]) {
      expect(schema.safeParse({ active: value }).success).toBe(true)
    }
    expect(schema.safeParse({ active: "yes" }).success).toBe(false)
  })
})
