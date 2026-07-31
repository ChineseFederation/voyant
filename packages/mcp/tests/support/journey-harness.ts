/**
 * Agent journey eval harness (voyant#3936, RFC voyant#3921).
 *
 * The #3921 plan is ordered instrument → measure → decide: the observability
 * seam (W1) and the size ratchets (W2) tell us how big the surface is, but
 * nothing yet measures whether an *agent* can actually get work done against it.
 * This harness closes that loop. It runs a fixed set of realistic journeys —
 * each an explicit, scripted sequence of MCP calls standing in for what an agent
 * would do — and scores the MECHANICS of each: did it reach its terminal state,
 * how many tool calls it took, roughly how many tokens the responses cost, and
 * which {@link ToolError} codes it hit.
 *
 * It is deliberately model-free. A journey that needs a live LLM to drive it
 * gets disabled the first week a CI key rotates and is then worse than nothing,
 * so every scenario here is a deterministic scripted driver: given the results
 * so far it returns the next MCP call, or `null` to stop. The same transcript
 * runs identically on every commit, which is what makes a recorded baseline a
 * meaningful before/after.
 *
 * TOKEN ESTIMATE. We report bytes-of-response ÷ 4 as a token proxy — and only
 * the RESPONSE payloads (the `describe_tool` schemas and tool outputs an agent
 * actually pulls into its context), not the tiny request arguments. JSON schema
 * tokenizes denser than prose, so bytes/4 is a floor, not a ceiling; treat it as
 * a stable relative signal for regressions, not an exact token bill.
 */
import { Buffer } from "node:buffer"

/** Token proxy divisor. Response-bytes ÷ 4; see the file docblock — this is a floor. */
export const BYTES_PER_TOKEN = 4

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
}

const DISPATCH_ERROR_META_KEY = "voyant.travel/error"

/** A minimal MCP JSON-RPC transport: issue one method and return the parsed body. */
export type McpTransport = (method: string, params: unknown) => Promise<RpcBody>

interface RpcBody {
  result?: {
    isError?: boolean
    structuredContent?: unknown
    content?: Array<{ type?: string; text?: string }>
    _meta?: Record<string, unknown>
  }
  error?: { code?: number; message?: string }
}

interface HonoLike {
  request(path: string, init: unknown, env?: unknown, ctx?: unknown): Promise<Response>
}

let rpcSequence = 0

function rpcInit(method: string, params: unknown) {
  rpcSequence += 1
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcSequence, method, params }),
  }
}

async function readRpc(res: Response): Promise<RpcBody> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}") as RpcBody
  }
  return JSON.parse(text) as RpcBody
}

/** A transport bound to a mounted Hono MCP app, optionally with a test env/ctx. */
export function honoTransport(app: HonoLike, env?: unknown, ctx?: unknown): McpTransport {
  return async (method, params) =>
    readRpc(await app.request("/", rpcInit(method, params), env, ctx))
}

/**
 * One step an agent would take: invoke `tool` with `args`. `via` chooses the
 * dispatch path — a flat-name `tools/call` (the default) or routing through the
 * `call_tool` meta-tool — so a scenario can measure either indirection.
 */
export interface JourneyCall {
  tool: string
  args?: Record<string, unknown>
  via?: "flat" | "meta"
}

/** The observed outcome of one journey step. */
export interface JourneyStepResult {
  call: JourneyCall
  /** Response payload bytes (result, else error) — the token-proxy input. */
  bytes: number
  isError: boolean
  /** The ToolError code when the step failed with a structured domain error. */
  code?: string
  structured?: unknown
  text?: string
}

/** Given the steps so far, return the next call to make, or `null` to stop. */
export type JourneyDriver = (prior: readonly JourneyStepResult[]) => JourneyCall | null

export interface JourneyScenario {
  id: string
  title: string
  /** Scripted driver: the fixed sequence of MCP calls this journey performs. */
  drive: JourneyDriver
  /** Terminal-state predicate evaluated over the full transcript. */
  completed: (prior: readonly JourneyStepResult[]) => boolean
  /** Safety bound so a mis-scripted driver cannot loop forever. */
  maxCalls?: number
}

/** The four scores the brief asks for, per journey. */
export interface JourneyScore {
  id: string
  title: string
  completed: boolean
  calls: number
  bytes: number
  tokenEstimate: number
  errorsByCode: Record<string, number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Pull the structured domain error code off a failed `tools/call` result. */
function errorCodeOf(body: RpcBody): string | undefined {
  const meta = isRecord(body.result?._meta)
    ? body.result?._meta[DISPATCH_ERROR_META_KEY]
    : undefined
  const code = isRecord(meta) ? meta.code : undefined
  if (typeof code === "string" && code.length > 0) return code
  // A JSON-RPC transport error (unregistered/unauthorized flat name) has no
  // domain code; label it so it is still counted, not silently dropped.
  if (body.error) return "RPC_ERROR"
  return body.result?.isError === true ? "UNKNOWN" : undefined
}

async function issueCall(transport: McpTransport, call: JourneyCall): Promise<JourneyStepResult> {
  const params =
    call.via === "meta"
      ? { name: "call_tool", arguments: { name: call.tool, arguments: call.args ?? {} } }
      : { name: call.tool, arguments: call.args ?? {} }
  const body = await transport("tools/call", params)
  const payload = body.result ?? body.error ?? {}
  return {
    call,
    bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
    isError: body.result?.isError === true || body.error != null,
    ...(errorCodeOf(body) ? { code: errorCodeOf(body) } : {}),
    structured: body.result?.structuredContent,
    text: body.result?.content?.find((part) => part.type === "text")?.text,
  }
}

/** Drive one scenario to its terminal state and score all four metrics. */
export async function runJourney(
  transport: McpTransport,
  scenario: JourneyScenario,
): Promise<JourneyScore> {
  const prior: JourneyStepResult[] = []
  const errorsByCode: Record<string, number> = {}
  let bytes = 0
  const max = scenario.maxCalls ?? 12
  while (prior.length < max) {
    const call = scenario.drive(prior)
    if (!call) break
    const step = await issueCall(transport, call)
    prior.push(step)
    bytes += step.bytes
    if (step.isError) {
      const code = step.code ?? "UNKNOWN"
      errorsByCode[code] = (errorsByCode[code] ?? 0) + 1
    }
  }
  return {
    id: scenario.id,
    title: scenario.title,
    completed: scenario.completed(prior),
    calls: prior.length,
    bytes,
    tokenEstimate: Math.round(bytes / BYTES_PER_TOKEN),
    errorsByCode,
  }
}

/**
 * A legible, non-blocking report of a scenario run. This is the point of wiring
 * the harness into CI as a report first (voyant#3936 acceptance): a journey that
 * gets slower or starts erroring should be readable in the CI log, not buried in
 * a boolean pass/fail. Print it whether or not the assertions pass.
 */
export function formatJourneyReport(scores: readonly JourneyScore[]): string {
  const lines = [
    "agent journey eval — per-scenario scores (voyant#3936)",
    "  columns: completed | calls | ~tokens (resp bytes/4) | errors",
  ]
  for (const score of scores) {
    const errors = Object.entries(score.errorsByCode)
    const errorText = errors.length === 0 ? "none" : errors.map(([c, n]) => `${c}×${n}`).join(", ")
    lines.push(
      `  ${score.completed ? "✓" : "✗"} ${score.id.padEnd(26)} ` +
        `calls=${String(score.calls).padStart(2)} ` +
        `~tokens=${String(score.tokenEstimate).padStart(5)} ` +
        `errors=${errorText}`,
    )
  }
  const totalTokens = scores.reduce((sum, s) => sum + s.tokenEstimate, 0)
  const totalCalls = scores.reduce((sum, s) => sum + s.calls, 0)
  lines.push(
    `  TOTAL calls=${totalCalls} ~tokens=${totalTokens} ` +
      `completed=${scores.filter((s) => s.completed).length}/${scores.length}`,
  )
  return lines.join("\n")
}
