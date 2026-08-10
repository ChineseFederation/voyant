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
 * It lives in the operator application rather than `packages/mcp` because the selected
 * graph is a build artifact — `apps/operator/.voyant/` is gitignored and only
 * exists after `prepare:verify`, which this package's `test` script runs first.
 */

import { composeVoyantGraphRuntime } from "@voyant-travel/framework"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"

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
 * Ceiling for the AGGREGATE describe schema of the collapsed READ surface — the
 * exact surface the layered read projection (voyant#3932) reshapes.
 *
 * Before W8 this bounded every selected tool's input schema in aggregate
 * (~260,968 bytes across 264 tools). The reads that dominated that "CRUD tail"
 * are now collapsed into one `<domain>_query` tool per product area, so the thing
 * worth bounding is what an agent pays to `describe_tool` those query tools — the
 * union of each domain's read INPUT schemas plus a permissive output note, rather
 * than 133 separate reads each advertising its full (often heavy) output schema.
 *
 * Measured across the 24 query tools (name + description + input + output schema
 * from the served `describe_tool` descriptor): **115,559 bytes**, down from
 * **433,234 bytes** for the same 133 reads described individually pre-projection
 * — a ~73% cut, because collapsing drops the per-read output schemas that were
 * the bulk of a read's describe cost. The ceiling drops to 130,000 with headroom
 * for read-schema edits, tripping if a query tool's union balloons again.
 *
 * Writes are deliberately NOT collapsed (voyant#3921) and stay individually
 * described; their per-tool describe cost is bounded by the response budget at
 * call time and the eager `tools/list` ratchet above catches a regression to
 * eager loading.
 */
/**
 * Ceiling for the aggregate schema of EVERY selected tool, reads and writes.
 *
 * Measured at 260,968 bytes across 264 tools before voyant#3932. The read
 * collapse does not shrink this materially — the underlying read Tools still
 * exist in the registry and remain individually dispatchable — so it stays near
 * its pre-collapse value. Its job is to stop WRITE schemas growing unseen, since
 * they appear in neither the served tools/list nor the query-tool bound.
 */
const ALL_TOOLS_AGGREGATE_CEILING_BYTES = 275_000

const AGGREGATE_CEILING_BYTES = 130_000

/** Real Terra max: 10,421 bytes; advanced exact-command Tools retain 40 KB headroom. */
const DESCRIBE_RESPONSE_CEILING_BYTES = 40_000

/** Real Terra max after domain-scoped fallback: 6,485 bytes. */
const SEARCH_RESPONSE_CEILING_BYTES = 8_000

/** Rough proxy for tokens. JSON schema tokenizes denser than prose, so this is a floor. */
const BYTES_PER_TOKEN = 4

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

interface SerializedTool {
  name: string
}

const INTENT_TOOL_NAMES = [
  "create_person",
  "create_product",
  "create_option_unit",
  "create_departure",
  "publish_product",
  "book_product",
  "invoice_booking",
  "cancel_booking",
  "accept_proposal_for_booking",
] as const

const CALLER_INVENTED_ACTION_FIELDS = [
  "targetId",
  "idempotencyKey",
  "idempotencyFingerprint",
] as const

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

  it("does not make intent tools expose caller-invented action-ledger identity", async () => {
    const { app } = await mountSelectedGraphMcp()
    const manifest = (await (await app.request("/manifest", {}, TEST_ENV, TEST_CTX)).json()) as {
      tools: Array<{
        name?: string
        actionPolicy?: {
          invocation?: {
            requiredFields?: readonly string[]
            optionalFields?: readonly string[]
          }
        }
      }>
    }
    const byName = new Map(manifest.tools.map((tool) => [tool.name, tool]))

    for (const name of INTENT_TOOL_NAMES) {
      const tool = byName.get(name)
      expect(tool, `${name} was missing from the selected MCP manifest`).toBeDefined()
      expect(tool?.actionPolicy, `${name} did not publish its action policy`).toBeDefined()

      const invocation = tool?.actionPolicy?.invocation
      const exposed = [...(invocation?.requiredFields ?? []), ...(invocation?.optionalFields ?? [])]
      expect(
        exposed.filter((field) =>
          CALLER_INVENTED_ACTION_FIELDS.includes(
            field as (typeof CALLER_INVENTED_ACTION_FIELDS)[number],
          ),
        ),
        `${name} leaks action-ledger identity into the MCP protocol. Intent tools may ask ` +
          "for confirmation and may carry a server-issued approvalId, but target and " +
          "idempotency identity must be resolved behind the tool boundary.",
      ).toEqual([])
    }
  })

  it("registers every staff-audience tool the selected graph declares", async () => {
    // voyant#3682 acceptance (3): compose the published tool metadata with the
    // graph manifest and prove MCP discovery registers every admitted tool.
    //
    // The defect that issue reported is already fixed — `create_booking_extra`
    // now declares graph risk `high` against its `sensitive` tier. Two things
    // were checked before writing this, by reintroducing each break and watching
    // it fail, so nobody re-derives them:
    //
    //   - tier/risk mismatch → `assertCompatibleRisk` THROWS during registration,
    //     the mount fails, and every test in this file goes red. Loud.
    //   - a scope no access resource declares → the graph BUILD fails with
    //     VOYANT_GRAPH_UNKNOWN_REFERENCE. Loud, and earlier still.
    //
    // So this is not a guard against a live bug; it pins the RESULT those two
    // checks currently produce. The assertion above is a floor of 200 against
    // ~270 actual, which would absorb a drop of dozens in silence. Any filtering
    // introduced later between registration and the served index — a scope
    // intersection, a narrowed audience, a projection that stops emitting a
    // domain — shrinks the surface without tripping a floor. Assert by NAME.
    const { app } = await mountSelectedGraphMcp()
    const manifest = (await (await app.request("/manifest", {}, TEST_ENV, TEST_CTX)).json()) as {
      tools: Array<{ name?: string }>
    }
    const registered = new Set(manifest.tools.map(({ name }) => name))

    const runtime = createGeneratedGraphRuntime()
    const declared: string[] = []
    for (const tool of runtime.tools) {
      const definition = await tool.load<{
        name: string
        audience?: { allowed?: readonly string[] }
      }>()
      const name = tool.name ?? definition.name
      // The manifest is composed for a STAFF key. Customer-portal tools are
      // declared for the customer audience and are correctly absent here — the
      // audience filter is the point, not a gap. An undeclared audience defaults
      // to every grant audience, so it stays in scope. Anything else missing is a
      // registration failure.
      const allowed = definition.audience?.allowed
      if (allowed !== undefined && !allowed.includes("staff")) continue
      declared.push(name)
    }

    const missing = declared.filter((name) => !registered.has(name)).sort()
    expect(
      missing,
      `${missing.length} staff tool(s) the graph declares never reached the MCP manifest. ` +
        "These registered without error and were then filtered out of the served index — " +
        "check requiredScopes against the access catalog, action availability.status, and " +
        "the audience policy on each name above.",
    ).toEqual([])
    expect(declared.length).toBeGreaterThan(200)
  })

  it("bounds the AGGREGATE describe schema of the collapsed read surface", async () => {
    // Progressive disclosure made the long tail invisible to `tools/list`, which
    // is the point — but unbounded per-tool schema growth would then show up
    // nowhere. The layered read projection (voyant#3932) collapses the reads into
    // `<domain>_query` tools, so the thing worth bounding is the describe cost of
    // that query surface: `describe_tool` pays one query tool's whole union at a
    // time, and a broad `search_tools` surfaces several. This is the read half of
    // the old aggregate bound, re-pointed at what the projection actually serves.
    const { app } = await mountSelectedGraphMcp()

    // Enumerate the query tools the projection produces: one `<domain>_query` per
    // domain that owns a `get_*`/`list_*`/`search_*` read, derived exactly as the
    // transport derives it (owner package → domain slug).
    const runtime = createGeneratedGraphRuntime()
    const queryToolNames = new Set<string>()
    for (const tool of runtime.tools) {
      const definition = await tool.load<{ name: string }>()
      const name = tool.name ?? definition.name
      if (!/^(?:get|list|search)_/.test(name)) continue
      const owner = String((tool as { unitId?: string }).unitId ?? "")
      const domain = owner.replace(/^@[^/]+\//, "").split("#")[0] ?? owner
      if (domain.length > 0) queryToolNames.add(`${domain}_query`)
    }

    let totalBytes = 0
    const heaviest: Array<{ name: string; bytes: number }> = []
    for (const name of queryToolNames) {
      const described = await readRpc(
        await app.request(
          "/",
          rpc("tools/call", { name: "describe_tool", arguments: { name } }),
          TEST_ENV,
          TEST_CTX,
        ),
      )
      const descriptor = (described.result as { structuredContent?: Record<string, unknown> })
        ?.structuredContent
      expect(descriptor, `query tool ${name} was not describable`).toBeDefined()
      // Measure the advertised schema (name + description + input + output), the
      // same fields the pre-projection aggregate summed per read.
      const bytes = Buffer.byteLength(
        JSON.stringify({
          name: descriptor?.name,
          description: descriptor?.description,
          inputSchema: descriptor?.inputSchema,
          outputSchema: descriptor?.outputSchema,
        }),
        "utf8",
      )
      totalBytes += bytes
      heaviest.push({ name, bytes })
    }

    const top = heaviest
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map(({ name, bytes }) => `    ${String(bytes).padStart(7)}  ${name}`)
      .join("\n")

    expect(
      totalBytes,
      [
        `Aggregate query-tool describe schema: ${totalBytes.toLocaleString()} bytes across ${queryToolNames.size} query tools`,
        `  ~${Math.round(totalBytes / BYTES_PER_TOKEN).toLocaleString()} tokens if every read surface were described together`,
        "  heaviest:",
        top,
        "",
        "  Reads collapse into <domain>_query tools (voyant#3932); this bounds what",
        "  describe_tool pulls for the read surface. Writes are not collapsed and",
        "  are described individually. Raising the ceiling needs a recorded reason.",
      ].join("\n"),
    ).toBeLessThanOrEqual(AGGREGATE_CEILING_BYTES)
  })

  it("keeps long natural-language matches inside a recognized domain", async () => {
    const { app } = await mountSelectedGraphMcp()
    const searched = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "search_tools",
          arguments: {
            query: "cash refund booking entitlement phrase with no exact tool match",
            domain: "finance",
            limit: 50,
          },
        }),
        TEST_ENV,
        TEST_CTX,
      ),
    )
    const result = (
      searched.result as {
        structuredContent?: {
          returned?: number
          tools?: Array<{ name: string; domain: string }>
        }
      }
    ).structuredContent
    const tools = result?.tools ?? []

    expect(tools.length).toBeGreaterThan(0)
    expect(result?.returned).toBe(tools.length)
    expect(new Set(tools.map(({ domain }) => domain))).toEqual(new Set(["finance"]))
    expect(tools.map(({ name }) => name)).toContain("refund_cancelled_booking")
  })

  it("keeps a zero-hit fallback inside a recognized domain", async () => {
    const { app } = await mountSelectedGraphMcp()
    const searched = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "search_tools",
          arguments: { query: "quokka zephyr", domain: "finance", limit: 50 },
        }),
        TEST_ENV,
        TEST_CTX,
      ),
    )
    const result = (
      searched.result as {
        structuredContent?: {
          returned?: number
          tools?: Array<{ name: string; domain: string }>
        }
      }
    ).structuredContent
    const tools = result?.tools ?? []

    expect(tools.length).toBeGreaterThan(0)
    expect(result?.returned).toBe(tools.length)
    expect(new Set(tools.map(({ domain }) => domain))).toEqual(new Set(["finance"]))
    expect(tools.map(({ name }) => name)).toContain("finance_query")
  })

  it("bounds the served discovery responses a model actually pays for", async () => {
    const { app } = await mountSelectedGraphMcp()
    const manifest = (await (await app.request("/manifest", {}, TEST_ENV, TEST_CTX)).json()) as {
      tools: Array<{ name?: string }>
    }
    const names = new Set(manifest.tools.flatMap(({ name }) => (name ? [name] : [])))
    for (const name of [
      "accommodations_query",
      "bookings_query",
      "finance_query",
      "inventory_query",
      "operations_query",
      "relationships_query",
    ]) {
      names.add(name)
    }

    let heaviest = { name: "", bytes: 0 }
    for (const name of names) {
      const response = await app.request(
        "/",
        rpc("tools/call", { name: "describe_tool", arguments: { name } }),
        TEST_ENV,
        TEST_CTX,
      )
      const bytes = Buffer.byteLength(await response.text(), "utf8")
      if (bytes > heaviest.bytes) heaviest = { name, bytes }
    }
    expect(
      heaviest.bytes,
      `Largest served describe_tool response was ${heaviest.name} at ${heaviest.bytes} bytes`,
    ).toBeLessThanOrEqual(DESCRIBE_RESPONSE_CEILING_BYTES)

    const fallback = await app.request(
      "/",
      rpc("tools/call", {
        name: "search_tools",
        arguments: { query: "phrase guaranteed to have no exact capability match", limit: 50 },
      }),
      TEST_ENV,
      TEST_CTX,
    )
    const fallbackBytes = Buffer.byteLength(await fallback.text(), "utf8")
    expect(fallbackBytes).toBeLessThanOrEqual(SEARCH_RESPONSE_CEILING_BYTES)
  })

  it("still bounds EVERY selected tool's schema, writes included", async () => {
    // The query-tool bound above covers the collapsed READ surface only. Writes
    // are deliberately not collapsed (voyant#3921: per-action risk, confirmation,
    // ledger and approval metadata are load-bearing and must not be flattened),
    // and progressive disclosure keeps them out of the served `tools/list`.
    //
    // So without this, write schemas would be bounded NOWHERE — invisible to the
    // served ratchet and excluded from the read ratchet. `describe_tool` and
    // `call_tool` still pay their cost. This is the guard that was in place before
    // voyant#3932 narrowed the aggregate metric; it is kept as an independent
    // third bound rather than folded into either of the others.
    const runtime = createGeneratedGraphRuntime()
    let totalBytes = 0
    let toolCount = 0
    const heaviest: Array<{ name: string; bytes: number }> = []

    for (const tool of runtime.tools) {
      const definition = await tool.load<{
        name: string
        description: string
        inputSchema: unknown
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
      const name = tool.name ?? definition.name
      const bytes = Buffer.byteLength(
        JSON.stringify({ name, description: definition.description, inputSchema }),
        "utf8",
      )
      totalBytes += bytes
      toolCount += 1
      heaviest.push({ name, bytes })
    }

    const top = heaviest
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map(({ name, bytes }) => `    ${String(bytes).padStart(7)}  ${name}`)
      .join("\n")

    expect(
      totalBytes,
      [
        `Aggregate schema across ALL selected tools: ${totalBytes.toLocaleString()} bytes across ${toolCount} tools`,
        "  heaviest:",
        top,
        "",
        "  Not a per-connection cost — it bounds the whole selected surface so write",
        "  schemas cannot bloat unseen now that they appear in neither the served",
        "  tools/list nor the read-projection bound.",
      ].join("\n"),
    ).toBeLessThanOrEqual(ALL_TOOLS_AGGREGATE_CEILING_BYTES)
  })
})
