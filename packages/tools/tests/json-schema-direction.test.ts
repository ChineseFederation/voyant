import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createToolRegistry, defineTool } from "../src/index.js"

/**
 * `z.toJSONSchema` defaults to `io: "output"`, and a transform has no
 * statically known output type — so serializing a tool INPUT that way throws,
 * and the registry published a description-only stub with no parameter names,
 * types or required list. An agent could only guess field names, and every
 * guess returned a -32602 it could not learn from.
 *
 * A boolean query param is the common carrier: `active`, `activated`,
 * `isPrimary` all coerce a string, and that alone silently blanked the whole
 * tool's parameter list.
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true")

function registryWith(inputSchema: z.ZodType) {
  const registry = createToolRegistry()
  registry.register(
    defineTool({
      capabilityId: "test#tool.probe",
      name: "probe",
      description: "Probe tool.",
      inputSchema,
      outputSchema: z.object({ ok: z.boolean() }),
      requiredScopes: [],
      tier: "read",
      riskPolicy: {
        destructive: false,
        reversible: true,
        dryRunSupported: false,
        confirmationRequired: false,
        sideEffects: [],
      },
      async handler() {
        return { ok: true }
      },
    }),
  )
  return registry.list()[0]
}

describe("tool input schemas serialize in the input direction", () => {
  it("publishes real properties for a schema carrying a transform", () => {
    const manifest = registryWith(
      z.object({
        productId: z.string().min(1).describe("Which product."),
        active: booleanQueryParam.optional().describe("Filter by active state."),
      }),
    )

    const inputSchema = manifest.inputSchema as {
      properties?: Record<string, { description?: string }>
      required?: string[]
      "x-voyant-schema-quality"?: string
    }

    // The regression: this used to be the description-only stub.
    expect(inputSchema["x-voyant-schema-quality"]).toBeUndefined()
    expect(Object.keys(inputSchema.properties ?? {}).sort()).toEqual(["active", "productId"])
    expect(inputSchema.required).toEqual(["productId"])
    expect(inputSchema.properties?.active?.description).toBe("Filter by active state.")
  })

  it("still labels a genuinely unrepresentable input rather than throwing", () => {
    const manifest = registryWith(z.object({ when: z.coerce.date() }))
    const inputSchema = manifest.inputSchema as { "x-voyant-schema-quality"?: string }

    expect(inputSchema["x-voyant-schema-quality"]).toBe("runtime-only")
  })

  it("keeps output schemas in the output direction", () => {
    const manifest = registryWith(z.object({ id: z.string() }))
    const outputSchema = manifest.outputSchema as {
      properties?: Record<string, unknown>
    }

    expect(Object.keys(outputSchema.properties ?? {})).toEqual(["ok"])
  })
})
