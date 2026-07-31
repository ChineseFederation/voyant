/**
 * Agent journey eval — real-surface grounding (voyant#3936, RFC voyant#3921).
 *
 * The scored, act-to-completion journeys live in the mcp package
 * (`packages/mcp/tests/agent-journey-eval.test.ts`) over a seeded in-memory
 * backend, so completion is deterministic without a database or a model key.
 * This companion pins the OTHER half the brief insists on: that the tool names
 * those journeys drive are the names the REAL selected graph actually serves,
 * and it records what the discovery half of a journey costs against that real
 * surface. A previous eval fabricated tool names; this test fails loudly if any
 * of ours drift out of the registry.
 *
 * It measures only the model-free, database-free mechanics — `search_tools`
 * discovery and `describe_tool` schema fetch — because those are the steps that
 * pay the real per-tool token cost the #3921 read-projection work (W8) will be
 * sized to cut. Dispatch to a read handler needs a seeded DB and is covered by
 * the seeded mcp harness instead. Token estimate is response-bytes ÷ 4 (a floor;
 * JSON schema tokenizes denser than prose); see the mcp harness docblock.
 *
 * Baselines are recorded as named constants with headroom, and the report is
 * printed to stdout on every run — a discovery journey getting more expensive
 * should be legible in CI output, non-blocking, until the numbers are trusted
 * (the ratchet precedent in `selected-graph-mcp-tool-surface.test.ts`).
 */

import { Buffer } from "node:buffer"
import { composeVoyantGraphRuntime } from "@voyant-travel/framework"
import { Hono } from "hono"
import { beforeAll, describe, expect, it } from "vitest"

import { accessCatalog } from "../.voyant/access/selected-access-catalog.generated"
import {
  createGeneratedGraphRuntime,
  createGeneratedTestDeploymentResources,
} from "./api/generated-project-runtime.js"

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
}
const TEST_ENV = { DATABASE_URL: "postgres://test", VOYANT_API_KEY: "test" } as never
const TEST_CTX = { waitUntil() {}, passThroughOnException() {} } as never

/** Response-bytes ÷ 4 token proxy — a floor; see the mcp harness docblock. */
const BYTES_PER_TOKEN = 4

let rpcSequence = 0
function rpc(method: string, params: unknown) {
  rpcSequence += 1
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcSequence, method, params }),
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
async function mountSelectedGraphMcp(): Promise<Hono> {
  const selected = await createGeneratedTestDeploymentResources(createGeneratedGraphRuntime())
  const composed = await composeVoyantGraphRuntime({
    runtime: selected.runtime,
    capabilities: selected.capabilities,
    ports: selected.ports,
  })
  const mcp = composed.modules.find((module) => module.module.name === "mcp")
  const routes = await mcp?.lazyAdminRoutes?.()
  if (!routes) throw new Error("selected graph did not expose MCP admin routes")

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
  return app
}

async function callTool(
  app: Hono,
  name: string,
  args: Record<string, unknown>,
): Promise<{ bytes: number; result: Record<string, unknown> | undefined }> {
  const body = await readRpc(
    await app.request("/", rpc("tools/call", { name, arguments: args }), TEST_ENV, TEST_CTX),
  )
  const payload = body.result ?? body.error ?? {}
  return {
    bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
    result: body.result as Record<string, unknown> | undefined,
  }
}

function searchNames(result: Record<string, unknown> | undefined): string[] {
  const structured = (result as { structuredContent?: { tools?: Array<{ name: string }> } })
    ?.structuredContent
  return (structured?.tools ?? []).map(({ name }) => name)
}

/**
 * A discovery journey against the real surface: search for a capability by
 * keyword, then fetch the tool's full descriptor. It completes when the tool the
 * agent was looking for is both discoverable and describable — the two steps a
 * real agent takes before it can call anything under progressive disclosure.
 */
interface DiscoveryJourney {
  id: string
  query: string
  tool: string
}

const JOURNEYS: DiscoveryJourney[] = [
  { id: "discover-list-products", query: "products", tool: "list_products" },
  { id: "discover-get-product", query: "product", tool: "get_product" },
  { id: "discover-product-content", query: "product content", tool: "get_product_content" },
  { id: "discover-list-bookings", query: "bookings", tool: "list_bookings" },
  { id: "discover-get-booking", query: "booking", tool: "get_booking" },
  { id: "discover-list-departures", query: "departures", tool: "list_departures" },
]

interface DiscoveryScore {
  id: string
  tool: string
  completed: boolean
  found: boolean
  described: boolean
  calls: number
  tokenEstimate: number
}

async function runDiscovery(app: Hono, journey: DiscoveryJourney): Promise<DiscoveryScore> {
  const search = await callTool(app, "search_tools", { query: journey.query })
  const found = searchNames(search.result).includes(journey.tool)
  const describe = await callTool(app, "describe_tool", { name: journey.tool })
  const descriptor = (describe.result as { structuredContent?: { inputSchema?: unknown } })
    ?.structuredContent
  const described = describe.result?.isError !== true && descriptor?.inputSchema != null
  return {
    id: journey.id,
    tool: journey.tool,
    completed: found && described,
    found,
    described,
    calls: 2,
    tokenEstimate: Math.round((search.bytes + describe.bytes) / BYTES_PER_TOKEN),
  }
}

function formatReport(scores: readonly DiscoveryScore[]): string {
  const lines = [
    "agent journey eval — real-surface discovery (voyant#3936)",
    "  columns: completed | tool | calls | ~tokens (search + describe, resp bytes/4)",
  ]
  for (const s of scores) {
    lines.push(
      `  ${s.completed ? "✓" : "✗"} ${s.tool.padEnd(22)} ` +
        `calls=${s.calls} ~tokens=${String(s.tokenEstimate).padStart(5)}` +
        (s.completed ? "" : ` [found=${s.found} described=${s.described}]`),
    )
  }
  const total = scores.reduce((sum, s) => sum + s.tokenEstimate, 0)
  lines.push(
    `  TOTAL discovery ~tokens=${total} completed=${scores.filter((s) => s.completed).length}/${scores.length}`,
  )
  return lines.join("\n")
}

/**
 * Non-blocking ceiling for the whole discovery set's token estimate, with
 * headroom. It is dominated by the `describe_tool` schemas — the exact per-tool
 * cost the aggregate ratchet in `selected-graph-mcp-tool-surface.test.ts` bounds
 * and that the read projection (voyant#3932) is meant to cut. Lower it when W8
 * lands; raise it only with a recorded reason after reading the printed report.
 *
 * Measured at authoring: ~48,600 tokens across the six discovery journeys —
 * dominated by the real per-tool input schemas (get_booking alone is ~12,700).
 * That is a genuinely large discovery bill and precisely the signal this harness
 * exists to surface: the read projection (W8) should move it down, not up.
 */
const DISCOVERY_TOKEN_CEILING = 62_000

describe("agent journey eval — real selected-graph surface", () => {
  let scores: DiscoveryScore[] = []

  beforeAll(async () => {
    const app = await mountSelectedGraphMcp()
    scores = []
    for (const journey of JOURNEYS) scores.push(await runDiscovery(app, journey))
    process.stdout.write(`\n${formatReport(scores)}\n\n`)
  })

  it("discovers and describes every real tool the seeded journeys drive", () => {
    // This is the anti-fabrication guard: each name must resolve on the REAL
    // selected graph, or the seeded mcp harness is testing tools nobody serves.
    const broken = scores.filter((s) => !s.completed).map((s) => `${s.tool}(${s.id})`)
    expect(
      broken,
      `not discoverable/describable on the real surface: ${broken.join(", ")}`,
    ).toEqual([])
  })

  it("keeps discovery token cost under the non-blocking ceiling", () => {
    const total = scores.reduce((sum, s) => sum + s.tokenEstimate, 0)
    expect(
      total,
      `real-surface discovery cost ${total} tokens exceeded ceiling ${DISCOVERY_TOKEN_CEILING} — ` +
        "read the printed report; this is what the read projection (W8) should cut.",
    ).toBeLessThanOrEqual(DISCOVERY_TOKEN_CEILING)
  })
})
