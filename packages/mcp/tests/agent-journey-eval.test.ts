/**
 * Agent journey eval — scored scenarios over a seeded MCP deployment (voyant#3936).
 *
 * This is the executable half of the eval loop the #3921 plan calls for. The
 * ratchets in `apps/operator/tests/selected-graph-mcp-tool-surface.test.ts`
 * measure how BIG the surface is; this measures whether an agent can DO a job
 * against it — completion, call count, token cost, and error codes per journey.
 *
 * The deployment is seeded in-process: a registry of read tools carrying the
 * REAL underlying names the surface serves (`list_products`, `get_product`,
 * `get_product_content`, `list_bookings` — each verified against its owning
 * package's `defineTool` in packages/inventory and packages/bookings) backed by
 * a small in-memory fixture. Those reads are reached through the collapsed
 * `inventory_query` / `bookings_query` tools the transport projects (voyant#3932),
 * so the scenarios exercise the meta-tool / guide indirection and the read
 * projection exactly as a live agent would, without a database or a model API
 * key. Discovery of those same query tools on the REAL selected graph is grounded
 * separately in the operator starter test.
 *
 * The scores are recorded below as named baseline constants with docblocks that
 * say what they mean and when to move them — the ratchet precedent — and the run
 * prints a legible per-scenario report so a regression is visible in CI output,
 * not just a boolean. The token estimate is response-bytes ÷ 4 (see the harness
 * docblock); it is a floor and a relative signal, not an exact token bill.
 */
import { beforeAll, describe, expect, it } from "vitest"

import {
  formatJourneyReport,
  honoTransport,
  type JourneyScenario,
  type JourneyScore,
  type JourneyStepResult,
  runJourney,
} from "./support/journey-harness.js"
import { seededMcpApp } from "./support/seeded-deployment.js"

// --- Structured-content readers the scripted drivers chain through. ------------

interface ProductRow {
  id: string
  slug: string
  name: string
  status: string
}

function productList(step: JourneyStepResult | undefined): ProductRow[] {
  const data = (step?.structured as { data?: ProductRow[] } | undefined)?.data
  return Array.isArray(data) ? data : []
}

function bookingList(step: JourneyStepResult | undefined): Array<{ id: string; status: string }> {
  const data = (step?.structured as { data?: Array<{ id: string; status: string }> } | undefined)
    ?.data
  return Array.isArray(data) ? data : []
}

function describedName(step: JourneyStepResult | undefined): string | undefined {
  return (step?.structured as { name?: string } | undefined)?.name
}

function searchHit(step: JourneyStepResult | undefined, name: string): boolean {
  const tools = (step?.structured as { tools?: Array<{ name: string }> } | undefined)?.tools
  return Array.isArray(tools) && tools.some((t) => t.name === name)
}

// --- The fixed scenario set. ---------------------------------------------------

const SCENARIOS: JourneyScenario[] = [
  {
    // discover → describe → read: the canonical progressive-disclosure path, now
    // over the collapsed `inventory_query` read tool (voyant#3932).
    id: "discover-then-read-products",
    title: "search_tools → describe_tool → inventory_query(resource: products)",
    drive(prior) {
      if (prior.length === 0) return { tool: "search_tools", args: { query: "product" } }
      if (prior.length === 1) return { tool: "describe_tool", args: { name: "inventory_query" } }
      if (prior.length === 2) return { tool: "inventory_query", args: { resource: "products" } }
      return null
    },
    completed: (prior) =>
      searchHit(prior[0], "inventory_query") &&
      describedName(prior[1]) === "inventory_query" &&
      productList(prior[2]).length > 0,
  },
  {
    // The SAME journey as above, describing only the resource it actually wants.
    // Kept as a separate scenario rather than replacing the broad one so the
    // report shows both costs side by side on every run — that delta is the whole
    // argument for the narrowed describe, and it disappears if only one survives.
    //
    // `search_tools` already returns the query tool's description, which names
    // every resource, so naming one here costs no extra round trip. On the seeded
    // fixture the saving is modest (few resources, small schemas); on the real
    // selected graph `bookings_query` goes 20,573 → 1,811 bytes.
    id: "discover-then-read-products-narrowed",
    title: "search_tools → describe_tool(resource: products) → inventory_query",
    drive(prior) {
      if (prior.length === 0) return { tool: "search_tools", args: { query: "product" } }
      if (prior.length === 1)
        return {
          tool: "describe_tool",
          args: { name: "inventory_query", resource: "products" },
        }
      if (prior.length === 2) return { tool: "inventory_query", args: { resource: "products" } }
      return null
    },
    completed: (prior) =>
      searchHit(prior[0], "inventory_query") &&
      describedName(prior[1]) === "inventory_query" &&
      productList(prior[2]).length > 0,
  },
  {
    // Find a product, then read its composed content by the id just discovered.
    id: "find-product-read-content",
    title: "search_tools → inventory_query(products) → inventory_query(product_content)",
    drive(prior) {
      if (prior.length === 0) return { tool: "search_tools", args: { query: "product content" } }
      if (prior.length === 1)
        return { tool: "inventory_query", args: { resource: "products", status: "active" } }
      if (prior.length === 2) {
        const id = productList(prior[1])[0]?.id
        return id ? { tool: "inventory_query", args: { resource: "product_content", id } } : null
      }
      return null
    },
    completed(prior) {
      const id = productList(prior[1])[0]?.id
      // A nullable output schema is envelope-wrapped under `result` by the MCP
      // output contract, so the content id lands at structured.result.id.
      const wrapped = prior[2]?.structured as { result?: { id?: string } } | undefined
      return Boolean(id && !prior[2]?.isError && wrapped?.result?.id === id)
    },
  },
  {
    // List bookings with a filter, dispatched through the call_tool meta-tool.
    id: "list-bookings-with-filter",
    title: "search_tools → describe_tool → call_tool(bookings_query, confirmed)",
    drive(prior) {
      if (prior.length === 0) return { tool: "search_tools", args: { query: "booking" } }
      if (prior.length === 1) return { tool: "describe_tool", args: { name: "bookings_query" } }
      if (prior.length === 2)
        return {
          tool: "bookings_query",
          args: { resource: "bookings", status: "confirmed" },
          via: "meta",
        }
      return null
    },
    completed(prior) {
      const rows = bookingList(prior[2])
      return rows.length > 0 && rows.every((b) => b.status === "confirmed")
    },
  },
  {
    // Guide-first: read the discovery guide, then discover and read a product.
    id: "guide-then-act",
    title: "voyant_guide(discovery) → search_tools → inventory_query(product)",
    drive(prior) {
      if (prior.length === 0) return { tool: "voyant_guide", args: { topic: "discovery" } }
      if (prior.length === 1) return { tool: "search_tools", args: { query: "product" } }
      if (prior.length === 2)
        return { tool: "inventory_query", args: { resource: "product", id: "prod_seed_1" } }
      return null
    },
    completed(prior) {
      const guided = (prior[0]?.text ?? "").length > 0 && !prior[0]?.isError
      const product = (prior[2]?.structured as { product?: unknown } | undefined)?.product
      return guided && searchHit(prior[1], "inventory_query") && product != null
    },
  },
  {
    // An agent that fumbles input (no id/slug), reads the actionable error, and
    // recovers. Exercises the error-code breakdown while still completing.
    id: "recover-from-bad-input",
    title:
      "inventory_query(product) [INVALID_INPUT] → inventory_query(products) → inventory_query(product)",
    drive(prior) {
      if (prior.length === 0) return { tool: "inventory_query", args: { resource: "product" } }
      if (prior.length === 1) return { tool: "inventory_query", args: { resource: "products" } }
      if (prior.length === 2) {
        const id = productList(prior[1])[0]?.id
        return id ? { tool: "inventory_query", args: { resource: "product", id } } : null
      }
      return null
    },
    completed(prior) {
      const recovered = (prior[2]?.structured as { product?: unknown } | undefined)?.product
      return prior[0]?.code === "INVALID_INPUT" && recovered != null
    },
  },
]

/**
 * Recorded baselines — the point of the harness (voyant#3936 acceptance). Each
 * scenario's transcript is fully scripted, so `calls` is EXACT and asserted as
 * an equality: a change here means the number of round-trips a journey takes
 * changed, which is exactly the regression worth reviewing.
 *
 * `maxTokens` is a NON-BLOCKING ceiling with headroom, not an equality: response
 * sizes drift with tool-description and guide wording, and the brief wants a
 * slowdown to be *legible*, not a merge blocker, until the numbers are trusted.
 * The ceiling is ~1.5× the measured estimate so routine wording edits pass while
 * a gross regression (a tool's schema ballooning, an unbounded list) trips it.
 * When you intentionally change the surface, re-run, read the printed report,
 * and move the measured baseline in the comment plus the ceiling if needed.
 *
 * Measured estimates (response bytes ÷ 4). The describe_tool step dominates the
 * discovery journeys — it pays a tool's full input schema once, which is exactly
 * the per-tool cost the aggregate ratchet in the operator application bounds. The
 * guide journey pays the `voyant_guide` prose instead.
 *
 * RE-RECORDED 2026-08-05. The authoring numbers were taken before the layered
 * read projection (voyant#3932, PR #3984) and the live-client payload fixes
 * (PR #3990) landed, and nobody moved them afterwards — so the ceilings had
 * drifted to ~2.5x the real cost and would not have caught a doubling. Three
 * journeys got materially cheaper; none got more expensive:
 *
 *   journey                          calls  was    now    ceiling
 *   discover-then-read-products        3    1789   1186    1_800
 *   discover-then-read-products-narrow 3      —     926    1_400
 *   find-product-read-content          3     425    568      850
 *   list-bookings-with-filter          3    1092    724    1_100
 *   guide-then-act                     3     872    845    1_300
 *   recover-from-bad-input             3     422    422      650
 *
 * `find-product-read-content` rose 425 → 568 because the projection returns a
 * richer content envelope; that is the intended trade and not a regression. The
 * un-narrowed journeys each rose ~90 tokens against the previous re-recording
 * because a query tool's description now advertises the narrowed path — a fixed
 * cost paid once per describe, which the narrowed journey more than repays.
 *
 * The two `discover-then-read-products*` rows are the same journey with and
 * without a `resource` on `describe_tool`: 1186 → 926 here, and 20,573 → 1,811
 * BYTES on the real `bookings_query` (22 resources vs the fixture's 2). Keep both
 * so the delta stays visible. Ceilings are ~1.5x the measurement.
 */
const BASELINES: Record<string, { calls: number; maxTokens: number }> = {
  "discover-then-read-products": { calls: 3, maxTokens: 1_800 },
  "discover-then-read-products-narrowed": { calls: 3, maxTokens: 1_400 },
  "find-product-read-content": { calls: 3, maxTokens: 850 },
  "list-bookings-with-filter": { calls: 3, maxTokens: 1_100 },
  "guide-then-act": { calls: 3, maxTokens: 1_300 },
  "recover-from-bad-input": { calls: 3, maxTokens: 650 },
}

describe("agent journey eval harness", () => {
  let scores: JourneyScore[] = []

  beforeAll(async () => {
    const transport = honoTransport(seededMcpApp())
    scores = []
    for (const scenario of SCENARIOS) scores.push(await runJourney(transport, scenario))
    // Non-blocking report written straight to stdout so the numbers are legible
    // in CI on every run — vitest suppresses console.* on a passing file, which
    // would hide a token/call drift that stayed under the ceiling (voyant#3936).
    process.stdout.write(`\n${formatJourneyReport(scores)}\n\n`)
  })

  it("reaches the terminal state of every journey", () => {
    const incomplete = scores.filter((s) => !s.completed).map((s) => s.id)
    expect(incomplete, `incomplete journeys: ${incomplete.join(", ") || "none"}`).toEqual([])
  })

  it("takes exactly the recorded number of tool calls per journey", () => {
    for (const score of scores) {
      const baseline = BASELINES[score.id]
      expect(baseline, `no baseline recorded for ${score.id}`).toBeDefined()
      expect(score.calls, `${score.id} call count changed`).toBe(baseline?.calls)
    }
  })

  it("stays under the non-blocking token ceiling per journey", () => {
    for (const score of scores) {
      const ceiling = BASELINES[score.id]?.maxTokens ?? Number.POSITIVE_INFINITY
      expect(
        score.tokenEstimate,
        `${score.id} token estimate ${score.tokenEstimate} exceeded ceiling ${ceiling} — ` +
          "read the printed report; raise the baseline only with a recorded reason.",
      ).toBeLessThanOrEqual(ceiling)
    }
  })

  it("records tool errors broken down by ToolError code", () => {
    const byId = new Map(scores.map((s) => [s.id, s]))
    // The happy-path journeys hit no errors...
    for (const id of [
      "discover-then-read-products",
      "find-product-read-content",
      "list-bookings-with-filter",
      "guide-then-act",
    ]) {
      expect(byId.get(id)?.errorsByCode, `${id} unexpectedly errored`).toEqual({})
    }
    // ...and the recovery journey records exactly one INVALID_INPUT and no more.
    expect(byId.get("recover-from-bad-input")?.errorsByCode).toEqual({ INVALID_INPUT: 1 })
  })
})
