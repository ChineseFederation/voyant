/**
 * A real LLM driving the MCP surface as an MCP client would (voyant#3936).
 *
 * The scripted harness next door is deliberately model-free, and that stays the
 * CI lane — a journey that needs a live key gets disabled the first week the key
 * rotates and is then worse than nothing. But a scripted driver proves only that
 * the MECHANICS work: it is handed the tool name, the resource, and the argument
 * shape. It cannot fail the way a real agent fails.
 *
 * The questions only a model can answer are the ones the whole #3921 redesign
 * rests on. Does `search_tools` output actually lead a model to the right tool?
 * Does a query tool's description make it pass `resource` to `describe_tool`, or
 * does it pull the whole union? Is a `nextSteps` string followable? Those are
 * claims about PROSE, and prose cannot be unit-tested.
 *
 * So this lane is opt-in and never blocks: `VOYANT_RUN_LIVE_EVALS=1` plus a key
 * enables it; otherwise it does not run. It talks to the OpenAI HTTP API with
 * `fetch` rather than adding an SDK dependency to a published package for a
 * test-only path.
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** The three tier-0 meta-tools plus the guide tools a connecting client sees. */
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

/**
 * Resolve the key only for an explicitly enabled live-eval run, first from the
 * environment and then from the 0600 file the operator convention puts it in.
 * A developer having that shared token must not silently turn normal tests into
 * paid network calls.
 */
export function resolveOpenAiKey(): string | undefined {
  if (process.env.VOYANT_RUN_LIVE_EVALS !== "1") return undefined
  const fromEnv = process.env.OPENAI_API_KEY?.trim()
  if (fromEnv) return fromEnv
  try {
    const value = readFileSync(join(homedir(), ".config/agent-run/openai-token"), "utf8").trim()
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export interface LiveToolCall {
  name: string
  args: Record<string, unknown>
  /** Serialized response bytes — comparable with the scripted lane's proxy. */
  bytes: number
  isError: boolean
}

export interface LiveRunResult {
  /** Every MCP tool call the model chose to make, in order. */
  calls: LiveToolCall[]
  /** The model's final natural-language answer. */
  answer: string
  /** Real token usage reported by the API, not a bytes/4 proxy. */
  promptTokens: number
  completionTokens: number
  /** True when the loop hit its call cap instead of the model finishing. */
  exhausted: boolean
}

interface OpenAiToolDef {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

/**
 * Expose the MCP tier-0 surface as OpenAI function definitions.
 *
 * This mirrors what a real MCP client does — it reads `tools/list` and hands
 * those schemas to the model verbatim. Deriving them from the live `tools/list`
 * rather than hardcoding them is the point: if the resident surface regresses to
 * eager loading, this lane pays the same bill a real client would.
 */
export async function tierZeroAsOpenAiTools(
  transport: (method: string, params: unknown) => Promise<Record<string, unknown>>,
): Promise<OpenAiToolDef[]> {
  const listed = await transport("tools/list", {})
  const tools = ((listed.result as { tools?: Array<Record<string, unknown>> } | undefined)?.tools ??
    []) satisfies Array<Record<string, unknown>>
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: String(tool.name),
      description: String(tool.description ?? ""),
      parameters: (tool.inputSchema as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    },
  }))
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/**
 * Run one task to completion, letting the model choose every MCP call.
 *
 * `maxCalls` is a cost bound, not a correctness one — hitting it is reported as
 * `exhausted` rather than thrown, because "the model wandered" is a RESULT worth
 * recording, not an error to hide. A surface that takes 12 calls to answer a
 * three-call question has told you something.
 */
export async function runLiveJourney(input: {
  apiKey: string
  model: string
  task: string
  systemPrompt?: string
  tools: OpenAiToolDef[]
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ text: string; isError: boolean }>
  maxCalls?: number
}): Promise<LiveRunResult> {
  const maxCalls = input.maxCalls ?? 10
  const messages: ChatMessage[] = [
    ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
    { role: "user", content: input.task },
  ]
  const calls: LiveToolCall[] = []
  let promptTokens = 0
  let completionTokens = 0

  for (let turn = 0; turn <= maxCalls; turn += 1) {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages,
        tools: input.tools,
        tool_choice: "auto",
        temperature: 0,
      }),
    })
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`)
    }
    const body = (await res.json()) as {
      choices?: Array<{ message: ChatMessage; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    promptTokens += body.usage?.prompt_tokens ?? 0
    completionTokens += body.usage?.completion_tokens ?? 0

    const message = body.choices?.[0]?.message
    if (!message) throw new Error("OpenAI returned no message")
    messages.push(message)

    const toolCalls = message.tool_calls ?? []
    if (toolCalls.length === 0) {
      return {
        calls,
        answer: message.content ?? "",
        promptTokens,
        completionTokens,
        exhausted: false,
      }
    }

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
      } catch {
        // A model emitting unparsable arguments is itself a finding; record the
        // attempt rather than crashing the run.
        args = {}
      }
      const { text, isError } = await input.callTool(call.function.name, args)
      calls.push({
        name: call.function.name,
        args,
        bytes: Buffer.byteLength(text, "utf8"),
        isError,
      })
      messages.push({ role: "tool", tool_call_id: call.id, content: text })
    }
  }

  return { calls, answer: "", promptTokens, completionTokens, exhausted: true }
}
