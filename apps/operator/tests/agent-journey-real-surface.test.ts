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
const TEST_ENV = {
  DATABASE_URL: "postgres://test",
  VOYANT_API_KEY: "test",
  CATALOG_EMBEDDING_PROVIDER: "none",
} as never
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
  /**
   * The resource this journey actually wants. `search_tools` already returns the
   * query tool's description, which names every resource, so an agent can pass
   * this to `describe_tool` and be advertised ONE branch instead of the union —
   * no extra round trip. Measured here so the saving is pinned on the real graph.
   */
  resource: string
}

// After the layered read projection (voyant#3932) the flat `get_*`/`list_*` reads
// are collapsed into one `<domain>_query` tool per product area, so a discovery
// journey now finds and describes the query tool for the record it wants. The
// same six product areas are covered; several journeys resolve to the SAME query
// tool (products/product/product-content all live in `inventory_query`), which is
// exactly the clustering that cuts the discovery bill.
const JOURNEYS: DiscoveryJourney[] = [
  { id: "discover-products", query: "products", tool: "inventory_query", resource: "products" },
  { id: "discover-product", query: "product", tool: "inventory_query", resource: "product" },
  {
    id: "discover-product-content",
    query: "product content",
    tool: "inventory_query",
    resource: "product_content",
  },
  { id: "discover-bookings", query: "bookings", tool: "bookings_query", resource: "bookings" },
  { id: "discover-booking", query: "booking", tool: "bookings_query", resource: "booking" },
  {
    id: "discover-departures",
    query: "departures",
    tool: "operations_query",
    resource: "departures",
  },
]

interface DiscoveryScore {
  id: string
  tool: string
  completed: boolean
  found: boolean
  described: boolean
  calls: number
  tokenEstimate: number
  /** The same journey describing only `journey.resource` — same call count. */
  narrowedTokenEstimate: number
}

async function runDiscovery(app: Hono, journey: DiscoveryJourney): Promise<DiscoveryScore> {
  const search = await callTool(app, "search_tools", { query: journey.query })
  const found = searchNames(search.result).includes(journey.tool)
  const describe = await callTool(app, "describe_tool", { name: journey.tool })
  const descriptor = (describe.result as { structuredContent?: { inputSchema?: unknown } })
    ?.structuredContent
  const described = describe.result?.isError !== true && descriptor?.inputSchema != null

  // Same two calls, one argument different. Anything that makes this path error
  // or return no schema must fail the journey, or the comparison is measuring a
  // broken call against a working one.
  const narrowed = await callTool(app, "describe_tool", {
    name: journey.tool,
    resource: journey.resource,
  })
  const narrowedDescriptor = (narrowed.result as { structuredContent?: { inputSchema?: unknown } })
    ?.structuredContent
  const narrowedDescribed =
    narrowed.result?.isError !== true && narrowedDescriptor?.inputSchema != null

  return {
    id: journey.id,
    tool: journey.tool,
    completed: found && described && narrowedDescribed,
    found,
    described: described && narrowedDescribed,
    calls: 2,
    tokenEstimate: Math.round((search.bytes + describe.bytes) / BYTES_PER_TOKEN),
    narrowedTokenEstimate: Math.round((search.bytes + narrowed.bytes) / BYTES_PER_TOKEN),
  }
}

function formatReport(scores: readonly DiscoveryScore[]): string {
  const lines = [
    "agent journey eval — real-surface discovery (voyant#3936)",
    "  columns: completed | tool | calls | ~tokens broad → narrowed (resp bytes/4)",
  ]
  for (const s of scores) {
    const cut =
      s.tokenEstimate > 0 ? Math.round((1 - s.narrowedTokenEstimate / s.tokenEstimate) * 100) : 0
    lines.push(
      `  ${s.completed ? "✓" : "✗"} ${s.tool.padEnd(22)} ` +
        `calls=${s.calls} ~tokens=${String(s.tokenEstimate).padStart(5)} → ` +
        `${String(s.narrowedTokenEstimate).padStart(5)} (-${cut}%)` +
        (s.completed ? "" : ` [found=${s.found} described=${s.described}]`),
    )
  }
  const total = scores.reduce((sum, s) => sum + s.tokenEstimate, 0)
  const narrowedTotal = scores.reduce((sum, s) => sum + s.narrowedTokenEstimate, 0)
  lines.push(
    `  TOTAL discovery ~tokens=${total} → ${narrowedTotal} ` +
      `(-${Math.round((1 - narrowedTotal / total) * 100)}%) ` +
      `completed=${scores.filter((s) => s.completed).length}/${scores.length}`,
  )
  return lines.join("\n")
}

/**
 * Non-blocking ceiling for the whole discovery set's token estimate, with
 * headroom. It is dominated by the `describe_tool` schemas an agent pulls to form
 * a call. Lower it when the surface shrinks; raise it only with a recorded reason
 * after reading the printed report.
 *
 * History: at W8's authoring this stood at 62,000 with a measured ~48,553 tokens,
 * when each journey discovered and described one FLAT read (`get_booking` alone
 * was ~12,700, dominated by its full Booking output schema).
 *
 * LOWERED 56,000 → 48,000: measured 43,730. The ceiling went up for the search
 * vocabulary and has come back down further than it rose, because the query
 * projection stopped repeating the `_voyant` control object once per union
 * branch — `bookings_query` was carrying it 22 times for a read-only tool that
 * cannot use any of those controls. Ratchets only shrink; this one shrank.
 *
 * RAISED 45,000 → 56,000 when the search vocabulary landed (voyant#3921).
 * Measured 38,587 → 48,184, a deliberate +25%: expanding a query through the
 * ubiquitous-language aliases MATCHES MORE TOOLS, so every `search_tools`
 * response is larger. That is the mechanism, not a side effect — before it, an
 * agent asked to add a client got one irrelevant hit and reported the capability
 * did not exist. Five of the six capability journeys go from failing or
 * error-retrying to clean first-try completion on the back of it.
 *
 * This is the trade #3921 asks for in that order: capability first, then cost.
 * The narrowed-describe column in the report shows 28,307 for the same set, so
 * the per-call lever still works; what grew is discovery breadth. If this needs
 * winning back, cap the default `search_tools` limit rather than narrowing the
 * vocabulary — the vocabulary is what makes the surface findable at all.
 *
 * The layered read projection (voyant#3932) then collapsed the ~133 reads into
 * ~24 `<domain>_query` tools: a journey now describes the query tool for the
 * record it wants, which advertises the union of its resources' compact INPUT
 * schemas and a permissive output note instead of one read's heavy output. That
 * cut the same six journeys to **~36,974 tokens** (a ~24% reduction), so the
 * ceiling drops to 45,000 — headroom over the measurement for search-wording
 * drift (a broad `search_tools` over the many booking WRITE tools is the largest
 * remaining line), while still tripping if a describe payload balloons again.
 */
const DISCOVERY_TOKEN_CEILING = 48_000

/**
 * This hook composes the whole selected graph and runs every journey, which
 * exceeds vitest's 10s default hook timeout when the operator suite runs its
 * files in parallel — it passes in isolation and fails in a full run, the worst
 * kind of flake. The config raises `testTimeout` but not `hookTimeout`, so set it
 * explicitly here rather than relying on scheduling luck.
 */
const HOOK_TIMEOUT_MS = 60_000

describe("agent journey eval — real selected-graph surface", () => {
  let scores: DiscoveryScore[] = []

  beforeAll(async () => {
    const app = await mountSelectedGraphMcp()
    scores = []
    for (const journey of JOURNEYS) scores.push(await runDiscovery(app, journey))
    process.stdout.write(`\n${formatReport(scores)}\n\n`)
  }, HOOK_TIMEOUT_MS)

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

  it("makes a narrowed describe materially cheaper than the full union", () => {
    // The saving is the whole reason `resource` exists on describe_tool, and it is
    // the kind of property that rots quietly: adding a resource to a domain makes
    // the union grow and the narrowed branch stay flat, so the gap should only
    // widen. Assert the FLOOR, not the measurement, so ordinary schema edits pass.
    //
    // Measured on the selected graph: 38,587 → 18,659 tokens across the six
    // journeys (-52%). Per-journey cuts run 36–71% rather than the 91% the
    // `bookings_query` DESCRIPTOR alone sees (20,573 → 1,811 bytes), because each
    // journey also pays an unchanged `search_tools` call — that half of the bill
    // is untouched by this and is the next thing worth attacking.
    //
    // A 30% floor leaves room for a domain whose query tool has one resource
    // (nothing to narrow) to enter the set without failing this.
    const total = scores.reduce((sum, s) => sum + s.tokenEstimate, 0)
    const narrowedTotal = scores.reduce((sum, s) => sum + s.narrowedTokenEstimate, 0)
    const cut = 1 - narrowedTotal / total

    expect(
      cut,
      `narrowed describe saved only ${Math.round(cut * 100)}% (${total} → ${narrowedTotal} tokens). ` +
        "Either the union stopped carrying per-resource schemas, or narrowing stopped " +
        "pruning them — read the printed report.",
    ).toBeGreaterThan(0.3)
  })
})
