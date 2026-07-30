/**
 * Context-cost ratchet for the MCP tool surface (voyant#3926, RFC voyant#3921).
 *
 * Every tool the selected graph registers is serialized eagerly into `tools/list`
 * on every MCP connection, before the agent has read the user's request. At the
 * time this ratchet was introduced that cost **264 tools / ~310 KB / ~78k tokens**,
 * which is a substantial fraction of a context window spent on navigating us
 * rather than doing the job.
 *
 * This test measures the payload and fails when it grows. It is deliberately a
 * ratchet, not an assertion of a good number: the current ceiling is bad, and
 * the progressive-disclosure (voyant#3927) and read-projection (voyant#3932)
 * workstreams exist to lower it. **Lower the ceiling when they land; never raise
 * it without a recorded reason.**
 *
 * It lives in the operator starter rather than `packages/mcp` because the
 * selected graph is a build artifact — `starters/operator/.voyant/` is
 * gitignored and only exists after `prepare:verify`, which this package's `test`
 * script runs first.
 */

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createGeneratedGraphRuntime } from "./api/generated-project-runtime.js"

/**
 * Ceiling for the serialized `tools/list` payload, in bytes.
 *
 * Measured 2026-07-30 at 310,502 bytes across 264 tools (reads 133 / 101 KB,
 * writes 131 / 209 KB). The headroom is deliberately small — this is meant to
 * catch surface growth, and a new CRUD tool costs roughly the 880-byte median.
 */
const PAYLOAD_CEILING_BYTES = 325_000

/** Rough proxy for tokens. JSON schema tokenizes denser than prose, so this is a floor. */
const BYTES_PER_TOKEN = 4

interface SerializedTool {
  name: string
  bytes: number
  read: boolean
}

function isReadTool(name: string): boolean {
  return /^(get|list|search)_/.test(name)
}

async function serializeToolSurface(): Promise<{
  tools: SerializedTool[]
  totalBytes: number
}> {
  const runtime = createGeneratedGraphRuntime()
  const tools: SerializedTool[] = []
  let totalBytes = 0

  for (const tool of runtime.tools) {
    const definition = await tool.load<{
      name: string
      description: string
      inputSchema: z.ZodType
      annotations?: unknown
    }>()

    // The transport advertises a projected schema; `toJSONSchema` is a stable
    // proxy for it. Unrepresentable nodes fall back to a permissive object,
    // exactly as the transport's projection does.
    let inputSchema: unknown
    try {
      inputSchema = z.toJSONSchema(definition.inputSchema, {
        io: "input",
        unrepresentable: "any",
      })
    } catch {
      inputSchema = { type: "object", additionalProperties: true }
    }

    const advertised = {
      name: tool.name ?? definition.name,
      description: definition.description,
      inputSchema,
      annotations: definition.annotations,
      _meta: {
        "voyant.travel/tool": {
          capabilityId: tool.id,
          requiredScopes: tool.requiredScopes,
          risk: tool.risk,
        },
      },
    }

    const bytes = Buffer.byteLength(JSON.stringify(advertised), "utf8")
    totalBytes += bytes
    tools.push({ name: advertised.name, bytes, read: isReadTool(advertised.name) })
  }

  return { tools, totalBytes }
}

function diagnose(tools: SerializedTool[], totalBytes: number): string {
  const heaviest = [...tools]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)
    .map(({ name, bytes }) => `    ${String(bytes).padStart(7)}  ${name}`)
    .join("\n")
  const reads = tools.filter(({ read }) => read)
  const readBytes = reads.reduce((sum, { bytes }) => sum + bytes, 0)

  return [
    `MCP tools/list payload: ${totalBytes.toLocaleString()} bytes across ${tools.length} tools`,
    `  ~${Math.round(totalBytes / BYTES_PER_TOKEN).toLocaleString()} tokens charged on every connection`,
    `  reads:  ${reads.length} tools / ${readBytes.toLocaleString()} bytes`,
    `  writes: ${tools.length - reads.length} tools / ${(totalBytes - readBytes).toLocaleString()} bytes`,
    "  heaviest tools:",
    heaviest,
    "",
    "  If this grew intentionally, lower the surface first — see voyant#3921.",
    "  Raising PAYLOAD_CEILING_BYTES needs a recorded reason.",
  ].join("\n")
}

describe("selected-graph MCP tool surface cost", () => {
  it("keeps the eagerly-serialized tools/list payload under the ratchet", async () => {
    const { tools, totalBytes } = await serializeToolSurface()

    expect(tools.length).toBeGreaterThan(0)
    // The diagnosis is the point of a ratchet failure — attach it to the
    // assertion so CI output alone explains what grew and by how much.
    expect(totalBytes, diagnose(tools, totalBytes)).toBeLessThanOrEqual(PAYLOAD_CEILING_BYTES)
  })

  it("reports every tool with a name and a description", async () => {
    const { tools } = await serializeToolSurface()
    const unnamed = tools.filter(({ name }) => !name || name.length === 0)

    expect(unnamed).toEqual([])
  })
})
