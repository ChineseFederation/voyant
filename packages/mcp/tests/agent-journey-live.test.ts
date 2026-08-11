/**
 * Live-client agent journey eval (voyant#3936, RFC voyant#3921).
 *
 * OPT-IN. Skipped unless `VOYANT_RUN_LIVE_EVALS=1` and an `OPENAI_API_KEY` (or
 * `~/.config/agent-run/openai-token`) is available, so CI stays deterministic
 * and a rotated key can never redden the build. Run it deliberately when
 * changing the prose an agent depends on.
 *
 * Why it exists alongside the scripted lane rather than replacing it: the
 * scripted driver is handed the tool name, the resource, and the argument shape,
 * so it proves the mechanics work and nothing about whether an agent can FIND its
 * way. Every remaining #3921 claim is a claim about prose —
 *
 *   - `search_tools` returns one-line descriptions that should lead to the right
 *     tool without a schema,
 *   - a query tool's description should make a model pass `resource` to
 *     `describe_tool` instead of pulling the whole union,
 *   - `nextSteps` on a ToolError should be followable enough to recover,
 *
 * — and prose cannot be unit-tested. A model is the only instrument that reads it
 * the way the customer does.
 *
 * These assertions are deliberately loose. The tight ones live in the scripted
 * lane; here a hard equality would just be flake, because the thing under test is
 * a probabilistic reader. What is asserted is the OUTCOME (did it get the answer,
 * without wandering), and the report prints the transcript so a regression in
 * wording is legible rather than merely numeric.
 */
import { beforeAll, describe, expect, it } from "vitest"

import { honoTransport } from "./support/journey-harness.js"
import {
  type LiveRunResult,
  resolveOpenAiKey,
  runLiveJourney,
  tierZeroAsOpenAiTools,
} from "./support/live-client.js"
import { seededMcpApp } from "./support/seeded-deployment.js"

const apiKey = resolveOpenAiKey()

/** Overridable so a run can be pointed at a different tier without an edit. */
const MODEL = process.env.VOYANT_EVAL_MODEL ?? "gpt-4o-mini"

/**
 * A live call is slow and rate-limited; the default 5s would fail on latency
 * rather than on anything this test is about.
 */
const LIVE_TIMEOUT_MS = 120_000

interface LiveScenario {
  id: string
  task: string
  /** The answer is correct when it contains this, case-insensitively. */
  expect: string
  /** Generous cap — exceeding it means the model wandered, which is the finding. */
  maxCalls: number
}

const SCENARIOS: LiveScenario[] = [
  {
    // Can a model get from a plain question to the right collapsed query tool
    // using only one-line search results? This is the discovery claim.
    id: "find-a-product",
    task: "What products are in the catalog? Name them.",
    expect: "kyoto",
    maxCalls: 6,
  },
  {
    // The actionable-error claim (voyant#3947/#3950): a deliberately impossible
    // filter should produce a recoverable failure, not a dead end.
    id: "recover-from-error",
    task: "List bookings whose status is 'confirmed'. Report how many there are.",
    expect: "2",
    maxCalls: 6,
  },
]

const INTERMITTENT: LiveScenario[] = [
  {
    // voyant#3921: an agent that searches for a RECORD NAME in `search_tools`
    // does not recover. Reproduced against gpt-4o-mini AND gpt-4o, and against
    // four different response designs (bare empty result, advisory `noMatch`
    // block, `exactMatch: false` flag, worked example). It searches the tool
    // catalog for "Kyoto Cherry Blossom Tour", gets no tool name match, and
    // concludes the RECORD does not exist — gpt-4o quits after a single call.
    //
    // The seeded `list_products` now carries the real tool's `search` filter, so
    // the journey IS satisfiable; the model never reaches it. Returning the query
    // tools as fallback results stopped the worst behaviour (gpt-4o-mini went
    // from 9 calls and exhaustion to 3) but did not close the gap.
    //
    // Partial-term ranking made this pass, but repeated runs of this legacy
    // comparison model still alternate between reading product content and
    // stopping at the product summary. Keep the trace visible without claiming
    // either reliable success or reliable failure; the production selected-graph
    // capability lane remains the gated record-name-discovery authority.
    id: "chain-an-id",
    task: "What is the itinerary of the Kyoto Cherry Blossom Tour? List the stops.",
    expect: "bamboo",
    maxCalls: 8,
  },
]

const ALL_SCENARIOS = [...SCENARIOS, ...INTERMITTENT]

const scores = new Map<string, LiveRunResult>()

function formatReport(): string {
  const lines = [
    `live-client agent journey eval — model=${MODEL} (voyant#3936)`,
    "  columns: id | mcp calls | prompt+completion tokens (real) | tool sequence",
  ]
  for (const [id, run] of scores) {
    // Print the ARGUMENTS, not just the tool names. A model that calls the right
    // tool with the wrong argument looks identical to a model that succeeded
    // until you see what it asked for.
    const sequence = run.calls
      .map((c) => {
        const detail = c.args.resource ?? c.args.query ?? c.args.name ?? ""
        return `${c.name}(${String(detail)})${c.isError ? "!" : ""}`
      })
      .join(" → ")
    lines.push(
      `  ${run.exhausted ? "✗" : "✓"} ${id.padEnd(20)} calls=${String(run.calls.length).padStart(2)} ` +
        `tokens=${String(run.promptTokens + run.completionTokens).padStart(6)} ${sequence}`,
    )
  }
  return lines.join("\n")
}

describe.skipIf(!apiKey)("live-client agent journey eval", () => {
  beforeAll(async () => {
    if (!apiKey) return
    const app = seededMcpApp()
    const transport = honoTransport(app)
    const tools = await tierZeroAsOpenAiTools(transport)

    /** Dispatch what the model asked for straight at the MCP surface. */
    const callTool = async (name: string, args: Record<string, unknown>) => {
      const body = await transport("tools/call", { name, arguments: args })
      const result = body.result as
        | { isError?: boolean; content?: Array<{ text?: string }>; structuredContent?: unknown }
        | undefined
      const text =
        result?.structuredContent !== undefined
          ? JSON.stringify(result.structuredContent)
          : (result?.content?.[0]?.text ?? JSON.stringify(body))
      return { text, isError: result?.isError === true }
    }

    for (const scenario of ALL_SCENARIOS) {
      scores.set(
        scenario.id,
        await runLiveJourney({
          apiKey,
          model: MODEL,
          task: scenario.task,
          systemPrompt:
            "You are connected to a travel operator's MCP server. Use the provided " +
            "tools to answer. Do not invent data — every fact must come from a tool result.",
          tools,
          callTool,
          maxCalls: scenario.maxCalls,
        }),
      )
    }
    process.stdout.write(`\n${formatReport()}\n\n`)
  }, LIVE_TIMEOUT_MS * ALL_SCENARIOS.length)

  it.each(SCENARIOS)("answers '$id' from tool results alone", ({ id, expect: needle }) => {
    const run = scores.get(id)
    expect(run, `${id} did not run`).toBeDefined()
    expect(run?.exhausted, `${id} exhausted its call budget without answering`).toBe(false)
    expect(run?.answer.toLowerCase(), `${id} answer: ${run?.answer}`).toContain(
      needle.toLowerCase(),
    )
  })

  it.each(INTERMITTENT)("measures intermittent '$id' without hiding its trace", ({ id }) => {
    const run = scores.get(id)
    expect(run, `${id} did not run`).toBeDefined()
    expect(run?.calls.length, `${id} never reached the MCP surface`).toBeGreaterThan(0)
  })

  it("reaches every answer through the MCP surface, never from model memory", () => {
    // The failure this guards is the quiet one: a model that answers plausibly
    // from pretraining without calling anything looks like a pass on the answer
    // assertion alone, and would mask a surface that is impossible to use.
    for (const [id, run] of scores) {
      expect(run.calls.length, `${id} answered without calling any tool`).toBeGreaterThan(0)
    }
  })

  it("uses the narrowed describe_tool rather than pulling a whole union", () => {
    // The voyant#4254 claim under test is not that narrowing WORKS — the scripted
    // lane proves that — but that a query tool's description leads a model to use
    // it unprompted. If this fails, the mechanism is fine and the wording is not,
    // which is a finding no schema-level test can produce.
    const describeCalls = [...scores.values()]
      .flatMap((run) => run.calls)
      .filter((call) => call.name === "describe_tool")

    // Not every scenario needs a describe; only judge the ones that did.
    if (describeCalls.length === 0) return

    const narrowed = describeCalls.filter((call) => typeof call.args.resource === "string")
    expect(
      narrowed.length,
      `${describeCalls.length} describe_tool call(s), none passed 'resource'. The narrowing ` +
        "exists but the description is not leading the model to it — read the printed report.",
    ).toBeGreaterThan(0)
  })
})
