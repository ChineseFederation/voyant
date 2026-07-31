/**
 * Context-cost ratchet for the MCP tool surface (voyant#3926, RFC voyant#3921),
 * lowered when progressive disclosure landed (voyant#3927).
 *
 * `tools/list` used to serialize every authorized tool eagerly on every MCP
 * connection, before the agent had read the user's request — **264 tools /
 * ~310 KB / ~78k tokens**, a substantial fraction of a context window spent on
 * navigating us rather than doing the job.
 *
 * Progressive disclosure (voyant#3927) replaced that eager surface with a tier-0
 * of meta-tools (`search_tools` / `describe_tool` / `call_tool`); the long tail of
 * domain tools is discovered and dispatched on demand. This test now measures the
 * REAL `tools/list` the transport serves for a full-scope staff key and fails when
 * it grows. The scope-filtered manifest at `GET /manifest` stays fine-grained — it
 * is the capability index, not the agent surface — and a separate assertion pins
 * that every tool there is still named and reachable.
 *
 * It lives in the operator starter rather than `packages/mcp` because the selected
 * graph is a build artifact — `starters/operator/.voyant/` is gitignored and only
 * exists after `prepare:verify`, which this package's `test` script runs first.
 */

import { composeVoyantGraphRuntime } from "@voyant-travel/framework"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { accessCatalog } from "../.voyant/access/selected-access-catalog.generated"
import {
  createGeneratedGraphRuntime,
  createGeneratedTestDeploymentResources,
} from "./api/generated-project-runtime.js"

/**
 * Ceiling for the serialized eager `tools/list` payload, in bytes.
 *
 * Measured at **2,940 bytes across 5 tier-0 tools** — the 3 meta-tools of
 * voyant#3927 plus the 2 resident guide Tools of voyant#3931 (was 1,472 bytes (was 310,502
 * for the meta-tools alone, and 310,502 bytes / 264 tools before voyant#3927 — a
 * ~105x reduction).
 *
 * The headroom is sized to tolerate guide and meta-tool description edits while
 * still tripping the moment a domain tool is registered eagerly again — each costs
 * roughly the old ~880-byte median, which is the regression worth catching. A
 * ceiling only a few bytes above the measurement would be a tripwire that fires on
 * routine wording changes, which trains people to raise it without reading.
 */
const PAYLOAD_CEILING_BYTES = 3_800

/**
 * Ceiling for the AGGREGATE size of every selected tool's advertised schema.
 *
 * Measured at 260,968 bytes across 264 tools (name + description + input schema;
 * the `_meta` envelope the transport also emits pushes the real figure higher).
 * Progressive disclosure
 * keeps this out of `tools/list`, so it is no longer a per-connection cost — but
 * `describe_tool` pays it one tool at a time and a broad `search_tools` pays a
 * slice of it, and nothing else bounds it now that the tail is invisible.
 * Lower it as the read projection (voyant#3932) collapses the CRUD surface.
 */
const AGGREGATE_CEILING_BYTES = 275_000

/** Rough proxy for tokens. JSON schema tokenizes denser than prose, so this is a floor. */
const BYTES_PER_TOKEN = 4

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
}
const TEST_ENV = { DATABASE_URL: "postgres://test", VOYANT_API_KEY: "test" } as never
const TEST_CTX = { waitUntil() {}, passThroughOnException() {} } as never

interface SerializedTool {
  name: string
}

function rpc(method: string, params: unknown) {
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }
}

async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}")
  }
  return JSON.parse(text)
}

/** Mount the selected-graph MCP admin routes behind a full-scope staff key. */
async function mountSelectedGraphMcp(): Promise<{ app: Hono; scopeCount: number }> {
  const selected = await createGeneratedTestDeploymentResources(createGeneratedGraphRuntime())
  const composed = await composeVoyantGraphRuntime({
    runtime: selected.runtime,
    capabilities: selected.capabilities,
    ports: selected.ports,
  })
  const mcp = composed.modules.find((module) => module.module.name === "mcp")
  const routes = await mcp?.lazyAdminRoutes?.()
  if (!routes) throw new Error("selected graph did not expose MCP admin routes")

  // A full-scope staff key: every resource:action the access catalog defines.
  const scopes = accessCatalog.resources.flatMap((resource) =>
    resource.actions.map((action) => `${resource.resource}:${action.action}`),
  )
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("scopes", scopes)
    c.set("actor", "staff")
    c.set("audience", "staff")
    c.set("db", {})
    await next()
  })
  app.route("/", routes)
  return { app, scopeCount: scopes.length }
}

async function serializeEagerToolSurface(): Promise<{
  tools: SerializedTool[]
  totalBytes: number
}> {
  const { app } = await mountSelectedGraphMcp()
  const listed = await readRpc(await app.request("/", rpc("tools/list", {}), TEST_ENV, TEST_CTX))
  const tools = (listed.result as { tools?: SerializedTool[] } | undefined)?.tools ?? []
  const totalBytes = Buffer.byteLength(JSON.stringify(tools), "utf8")
  return { tools, totalBytes }
}

function diagnose(tools: SerializedTool[], totalBytes: number): string {
  return [
    `MCP tools/list payload: ${totalBytes.toLocaleString()} bytes across ${tools.length} eager tools`,
    `  ~${Math.round(totalBytes / BYTES_PER_TOKEN).toLocaleString()} tokens charged on every connection`,
    `  tools: ${tools.map(({ name }) => name).join(", ")}`,
    "",
    "  Progressive disclosure (voyant#3927) keeps only tier-0 resident. If this grew,",
    "  a domain tool was likely registered eagerly again — discover it through",
    "  search_tools / describe_tool instead. Raising the ceiling needs a recorded reason.",
  ].join("\n")
}

describe("selected-graph MCP tool surface cost", () => {
  it("keeps the eagerly-serialized tools/list payload under the ratchet", async () => {
    const { tools, totalBytes } = await serializeEagerToolSurface()

    expect(tools.length).toBeGreaterThan(0)
    // The diagnosis is the point of a ratchet failure — attach it to the
    // assertion so CI output alone explains what grew and by how much.
    expect(totalBytes, diagnose(tools, totalBytes)).toBeLessThanOrEqual(PAYLOAD_CEILING_BYTES)
  })

  it("advertises exactly the tier-0 resident surface eagerly", async () => {
    const { tools } = await serializeEagerToolSurface()

    expect(tools.map(({ name }) => name).sort()).toEqual([
      "call_tool",
      "describe_tool",
      "search_tools",
      // The guide layer (voyant#3931) is resident by design: with no eager domain
      // surface, it is the only thing that tells a connecting agent what this
      // deployment is for. A guide reachable only by first guessing a search query
      // would be useless at exactly the moment it is needed.
      "voyant_glossary",
      "voyant_guide",
    ])
  })

  it("keeps every tool reachable and named through the fine-grained manifest index", async () => {
    const { app } = await mountSelectedGraphMcp()
    const manifest = (await (await app.request("/manifest", {}, TEST_ENV, TEST_CTX)).json()) as {
      tools: Array<{ name?: string }>
    }

    // The manifest is the backing capability index — it stays fine-grained so the
    // long tail remains discoverable and callable even though it is not resident.
    expect(manifest.tools.length).toBeGreaterThan(200)
    const unnamed = manifest.tools.filter(({ name }) => !name || name.length === 0)
    expect(unnamed).toEqual([])
  })

  it("still bounds the AGGREGATE schema size of the long tail", async () => {
    // Progressive disclosure made the long tail invisible to `tools/list`, which
    // is the point — but it also means unbounded per-tool schema growth would
    // show up nowhere. `describe_tool` still pays that cost one tool at a time,
    // and `search_tools` pays it in aggregate whenever a query matches broadly.
    //
    // So keep the pre-#3927 aggregate bound as a SECOND, independent guard. The
    // served-payload ratchet above catches "we went back to eager loading"; this
    // one catches "the tail quietly bloated while nobody could see it".
    const runtime = createGeneratedGraphRuntime()
    let totalBytes = 0
    let toolCount = 0
    const heaviest: Array<{ name: string; bytes: number }> = []

    for (const tool of runtime.tools) {
      const definition = await tool.load<{
        name: string
        description: string
        inputSchema: { _zod?: unknown }
      }>()
      let inputSchema: unknown
      try {
        inputSchema = z.toJSONSchema(definition.inputSchema as never, {
          io: "input",
          unrepresentable: "any",
        })
      } catch {
        inputSchema = { type: "object", additionalProperties: true }
      }
      const bytes = Buffer.byteLength(
        JSON.stringify({
          name: tool.name ?? definition.name,
          description: definition.description,
          inputSchema,
        }),
        "utf8",
      )
      totalBytes += bytes
      toolCount += 1
      heaviest.push({ name: tool.name ?? definition.name, bytes })
    }

    const top = heaviest
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map(({ name, bytes }) => `    ${String(bytes).padStart(7)}  ${name}`)
      .join("\n")

    expect(
      totalBytes,
      [
        `Aggregate tool schema size: ${totalBytes.toLocaleString()} bytes across ${toolCount} tools`,
        `  ~${Math.round(totalBytes / BYTES_PER_TOKEN).toLocaleString()} tokens if ever served together`,
        "  heaviest:",
        top,
        "",
        "  This is NOT the per-connection cost — progressive disclosure keeps the",
        "  tail out of tools/list. It bounds what describe_tool and a broad",
        "  search_tools can pull in, and stops the tail bloating unseen.",
      ].join("\n"),
    ).toBeLessThanOrEqual(AGGREGATE_CEILING_BYTES)
  })
})
