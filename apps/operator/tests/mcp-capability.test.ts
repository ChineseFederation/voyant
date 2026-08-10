// agent-quality: file-size exception -- owner: operator; the opt-in real-model harness keeps its chained journey fixtures, grading, transport trace, and machine report in one auditable evaluation artifact.
/**
 * MCP capability eval — can an agent do a travel agent's job? (voyant#3921)
 *
 * Everything else in this repo tests the MCP surface against a seeded in-memory
 * registry. That proves the transport and the projections, and it proved nothing
 * about whether the product WORKS: the first run of this file against the real
 * graph found that an agent could not add or find a client, because the surface
 * only answered to "person" and a travel agent says "client".
 *
 * So this is the proper instrument. Real selected graph, real MCP transport over
 * JSON-RPC, real database, real model choosing every call. It scores COMPLETION —
 * whether the work got done — and treats tokens and call counts as secondary,
 * because a cheap surface that cannot book a trip is worthless.
 *
 * Opt-in twice over: it needs TEST_DATABASE_URL and an OpenAI key, and skips
 * without either. It WRITES (that is the point), so point TEST_DATABASE_URL at a
 * disposable database.
 *
 * KNOWN REMAINING WORK — the idempotency sweep.
 *
 * Five creates now derive their key server-side and declare
 * `resolvesIdempotencyKeyServerSide` (person, product, option, unit, departure).
 * Roughly seventy tools still advertise a caller-facing `idempotencyKey`.
 *
 * That is NOT a blind sweep. Many are amendments and approvals where the caller
 * legitimately correlates a retry against an exact prior command, and stripping
 * the key there would break the guarantee it exists for. Each site needs the
 * judgement "does the handler own this command, or does the caller?".
 *
 * A chokepoint fix was tried and reverted: deriving inside
 * `executeInventoryGeneratedChild` would cover all four inventory children at
 * once, but `withServerResolvedIdempotencyKey` asserts the admission is
 * authentically minted, and the generated-children unit fixtures pass plain
 * objects. That assertion is correct and stricter than what came before, so the
 * fixtures need minting first — do that before retrying the chokepoint.
 *
 * READING THE PASS RATES. The journeys are chained, so a downstream rate is
 * CAPPED by its upstream one: if product-option-create leaves no bookable unit on
 * an attempt, booking-create on that same attempt is correctly refused, and
 * invoice-issue after it has no booking to invoice. A 0/3 on booking-create
 * therefore does not mean booking is broken — it usually means the setup ahead of
 * it failed. Read the chain top-down and fix the first link that is not 3/3;
 * today that is product-option-create.
 *
 * The journeys are chained on purpose — the person must exist before the booking,
 * the product before the departure — because that dependency is exactly what an
 * endpoint-shaped surface makes hard and what #3921 is trying to fix.
 */
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { type ServerType, serve } from "@hono/node-server"
import { bookingActivityLog, bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { createDbClient } from "@voyant-travel/db"
import { authAccount, authUser, userProfilesTable } from "@voyant-travel/db/schema/iam"
import { dbClientDispose } from "@voyant-travel/db/transaction-capability"
import { supplierDirectoryProjections, suppliers } from "@voyant-travel/distribution/schema"
import { financeService } from "@voyant-travel/finance"
import { invoices } from "@voyant-travel/finance/schema"
import { composeVoyantGraphRuntime } from "@voyant-travel/framework"
import { contractsService, policiesService } from "@voyant-travel/legal"
import { operatorProfile } from "@voyant-travel/operator-settings/schema"
import { proposalsService, tripSnapshotToProposalVersionApply } from "@voyant-travel/proposals"
import { tripsService } from "@voyant-travel/trips"
import { scopesForRole } from "@voyant-travel/types/member-roles"
import { sql as sqlRaw } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { accessCatalog } from "../.voyant/access/selected-access-catalog.generated"
import {
  createGeneratedGraphRuntime,
  createGeneratedTestDeploymentResources,
} from "./api/generated-project-runtime.js"
import { measureResponseFormats } from "./support/mcp-response-format-metrics.js"
import { fetchWithTransientRetry } from "./support/openai-response-retry.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

function resolveKey(): string | undefined {
  const env = process.env.OPENAI_API_KEY?.trim()
  if (env) return env
  try {
    const v = readFileSync(join(homedir(), ".config/agent-run/openai-token"), "utf8").trim()
    return v.length > 0 ? v : undefined
  } catch {
    return undefined
  }
}
const apiKey = resolveKey()
const EVAL_PROVIDER = process.env.VOYANT_EVAL_PROVIDER ?? "codex"
const MODEL = process.env.VOYANT_EVAL_MODEL ?? "gpt-5.6-terra"
const REASONING_EFFORT = "medium"
const REPORT_FILE = process.env.VOYANT_EVAL_REPORT_FILE?.trim()
const enabled = Boolean(TEST_DATABASE_URL && (EVAL_PROVIDER === "codex" || apiKey))

/** A live model turn plus a real dispatch is slow; the default would time out on latency. */
const JOURNEY_TIMEOUT_MS = 180_000

const TEST_ENV = {
  DATABASE_URL: TEST_DATABASE_URL ?? "",
  VOYANT_API_KEY: "test",
  CATALOG_EMBEDDING_PROVIDER: "none",
  "deployment.providers.adminAuth": "better-auth",
} as never
const TEST_CTX = { waitUntil() {}, passThroughOnException() {} } as never

let rpcSeq = 0
function rpc(method: string, params: unknown) {
  rpcSeq += 1
  return {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcSeq, method, params }),
  }
}
async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(
      text
        .split("\n")
        .find((l) => l.startsWith("data:"))
        ?.slice(5)
        .trim() ?? "{}",
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    return { error: { message: text.slice(0, 300) } }
  }
}

/** Mount the real selected-graph MCP behind a full-scope staff key and a REAL db. */
let verifyDb: ReturnType<typeof createDbClient> | undefined
let codexServer: ServerType | undefined
let codexServerUrl: string | undefined
let activeCodexCalls: ToolCallRecord[] | undefined

async function mountRealMcp(): Promise<Hono> {
  const db = createDbClient(TEST_DATABASE_URL as string, {
    adapter: "node",
    nodeMaxConnections: 4,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  })
  verifyDb = db
  const selected = await createGeneratedTestDeploymentResources(createGeneratedGraphRuntime(), {
    database: db,
  })
  const composed = await composeVoyantGraphRuntime({
    runtime: selected.runtime,
    capabilities: selected.capabilities,
    ports: selected.ports,
  })
  const routes = await composed.modules
    .find((module) => module.module.name === "mcp")
    ?.lazyAdminRoutes?.()
  if (!routes) throw new Error("selected graph did not expose MCP admin routes")

  const scopes = accessCatalog.resources.flatMap((resource) =>
    resource.actions.map((action) => `${resource.resource}:${action.action}`),
  )
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("scopes", scopes)
    c.set("actor", "staff")
    c.set("audience", "staff")
    c.set("db", db)
    c.set("userId", "user_capability_eval")
    await next()
  })
  app.route("/", routes)
  return app
}

async function startCodexMcpServer(app: Hono): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    codexServer = serve(
      {
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
          const requestBody = (await request
            .clone()
            .json()
            .catch(() => undefined)) as
            | { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }
            | undefined
          const response = await app.fetch(request, TEST_ENV, TEST_CTX)
          if (requestBody?.method === "tools/call" && activeCodexCalls) {
            const rpcBody = await readRpc(response.clone())
            const result = rpcBody.result as
              | {
                  isError?: boolean
                  content?: Array<{ text?: string }>
                  structuredContent?: unknown
                }
              | undefined
            const fullText =
              result?.structuredContent !== undefined
                ? JSON.stringify(result.structuredContent)
                : (result?.content?.[0]?.text ?? JSON.stringify(rpcBody))
            activeCodexCalls.push({
              name: String(requestBody.params?.name ?? "unknown"),
              args: requestBody.params?.arguments ?? {},
              isError: result?.isError === true,
              responseBytes: Buffer.byteLength(fullText, "utf8"),
              snippet: fullText.slice(0, 300),
            })
          }
          return response
        },
      },
      ({ port }) => resolvePromise(`http://127.0.0.1:${port}/`),
    )
    codexServer.once("error", reject)
  })
}

interface ToolCallRecord {
  name: string
  args: Record<string, unknown>
  isError: boolean
  responseBytes: number
  snippet: string
}
interface JourneyRun {
  calls: ToolCallRecord[]
  answer: string
  tokens: number
  exhausted: boolean
  modelTransportRetries: number
  fatal?: {
    source: "model_transport" | "harness"
    status: number | null
    code: string | null
    message: string
  }
}

async function runJourney(input: {
  app: Hono
  tools: unknown[]
  task: string
  maxCalls: number
  /** The server's own `instructions`, exactly as a real MCP client surfaces them. */
  serverInstructions: string
}): Promise<JourneyRun> {
  if (EVAL_PROVIDER === "codex") return runCodexJourney(input)
  const instructions =
    "You are the back-office agent for a travel operator, connected to its MCP server. " +
    "Use the tools to actually perform the work end to end. Never invent data. If a write " +
    "reports that confirmation or approval is required, follow the instructions in the " +
    "error and complete it. Finish by stating what you created, including any ids." +
    // A real MCP client reads `instructions` from `initialize` and puts it in
    // front of the model. This harness did not, which made it a WORSE client
    // than the ones we ship to — and the guide layer (voyant#3931) exists
    // precisely to orient the agent before its first call. Measuring a surface
    // while withholding its own operating instructions measures the harness.
    (input.serverInstructions ? `\n\n--- server instructions ---\n${input.serverInstructions}` : "")
  const calls: ToolCallRecord[] = []
  let tokens = 0
  let modelTransportRetries = 0
  let previousResponseId: string | undefined
  let nextInput: unknown = input.task

  for (let turn = 0; turn <= input.maxCalls; turn += 1) {
    const res = await fetchWithTransientRetry(
      () =>
        fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: MODEL,
            instructions,
            input: nextInput,
            tools: input.tools,
            tool_choice: "auto",
            reasoning: { effort: REASONING_EFFORT },
            previous_response_id: previousResponseId,
            store: true,
          }),
        }),
      {
        onRetry: ({ attempt, maxAttempts, status, delayMs }) => {
          modelTransportRetries += 1
          process.stdout.write(
            `model transport retry ${attempt}/${maxAttempts - 1}: ${status ?? "network_error"}, waiting ${delayMs}ms\n`,
          )
        },
      },
    )
    if (!res.ok) {
      const failure = parseModelFailure(res.status, await res.text())
      return {
        calls,
        answer: `FATAL: ${failure.message}`,
        tokens,
        exhausted: true,
        modelTransportRetries,
        fatal: failure,
      }
    }
    const body = (await res.json()) as {
      id?: string
      output_text?: string
      output?: Array<
        | { type: "function_call"; call_id: string; name: string; arguments: string }
        | { type: string; content?: Array<{ type?: string; text?: string }> }
      >
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    if (!body.id) throw new Error("OpenAI returned no response id")
    previousResponseId = body.id
    tokens += (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0)
    const toolCalls = (body.output ?? []).filter(
      (item): item is Extract<NonNullable<typeof body.output>[number], { type: "function_call" }> =>
        item.type === "function_call",
    )
    if (toolCalls.length === 0) {
      const text =
        body.output_text ??
        (body.output ?? [])
          .flatMap((item) => ("content" in item ? (item.content ?? []) : []))
          .map((content) => content.text ?? "")
          .join("")
      return { calls, answer: text, tokens, exhausted: false, modelTransportRetries }
    }

    const functionOutputs: Array<{
      type: "function_call_output"
      call_id: string
      output: string
    }> = []
    for (const call of toolCalls) {
      if (calls.length >= input.maxCalls) {
        return { calls, answer: "", tokens, exhausted: true, modelTransportRetries }
      }
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.arguments || "{}") as Record<string, unknown>
      } catch {
        args = {}
      }
      const rpcBody = await readRpc(
        await input.app.request(
          "/",
          rpc("tools/call", { name: call.name, arguments: args }),
          TEST_ENV,
          TEST_CTX,
        ),
      )
      const result = rpcBody.result as
        | { isError?: boolean; content?: Array<{ text?: string }>; structuredContent?: unknown }
        | undefined
      const fullText =
        result?.structuredContent !== undefined
          ? JSON.stringify(result.structuredContent)
          : (result?.content?.[0]?.text ?? JSON.stringify(rpcBody))
      const text = fullText.slice(0, 12_000)
      calls.push({
        name: call.name,
        args,
        isError: result?.isError === true,
        responseBytes: Buffer.byteLength(fullText, "utf8"),
        snippet: text.slice(0, 300),
      })
      functionOutputs.push({ type: "function_call_output", call_id: call.call_id, output: text })
    }
    nextInput = functionOutputs
  }
  return { calls, answer: "", tokens, exhausted: true, modelTransportRetries }
}

async function runCodexJourney(input: {
  task: string
  maxCalls: number
  serverInstructions: string
}): Promise<JourneyRun> {
  if (!codexServerUrl) throw new Error("Codex MCP bridge is not running")
  const calls: ToolCallRecord[] = []
  activeCodexCalls = calls
  const workspace = mkdtempSync(join(tmpdir(), "voyant-codex-mcp-eval-"))
  const prompt =
    "You are the back-office agent for a travel operator. Use only the voyant MCP tools " +
    "to perform the requested work; do not use shell commands or inspect local files. " +
    `Use at most ${input.maxCalls} MCP tool calls. Never invent data. If a write requires ` +
    "confirmation or approval, follow the model-visible remediation and complete it. " +
    `Finish with a concise durable outcome.\n\n${input.serverInstructions}\n\nTask: ${input.task}`
  try {
    const result = await spawnCodex([
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--cd",
      workspace,
      "--model",
      MODEL,
      "-c",
      `model_reasoning_effort=${JSON.stringify(REASONING_EFFORT)}`,
      "--json",
      "-c",
      `mcp_servers.voyant.url=${JSON.stringify(codexServerUrl)}`,
      prompt,
    ])
    let answer = ""
    let tokens = 0
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as {
          type?: string
          item?: { type?: string; text?: string }
          usage?: { input_tokens?: number; output_tokens?: number }
        }
        if (event.type === "item.completed" && event.item?.type === "agent_message") {
          answer = event.item.text ?? answer
        }
        if (event.type === "turn.completed") {
          tokens += (event.usage?.input_tokens ?? 0) + (event.usage?.output_tokens ?? 0)
        }
      } catch {
        // Codex diagnostics can share stderr/stdout; retain them only on failure.
      }
    }
    const exhausted = calls.length > input.maxCalls || result.exitCode !== 0
    return {
      calls,
      answer: answer || (result.exitCode === 0 ? "" : `FATAL: ${result.stderr.slice(0, 300)}`),
      tokens,
      exhausted,
      modelTransportRetries: 0,
      ...(result.exitCode === 0
        ? {}
        : {
            fatal: {
              source: "model_transport" as const,
              status: null,
              code: "codex_exec_failed",
              message: result.stderr.slice(0, 300),
            },
          }),
    }
  } finally {
    activeCodexCalls = undefined
    rmSync(workspace, { recursive: true, force: true })
  }
}

function spawnCodex(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const env = { ...process.env }
    for (const key of [
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "OPENAI_API_KEY",
      "VOYANT_API_KEY",
      "POSTGRES_SEARCH_CURSOR_SIGNING_KEY",
    ])
      delete env[key]
    const child = spawn("codex", args, { env, stdio: ["ignore", "pipe", "pipe"] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk) => stdout.push(chunk))
    child.stderr.on("data", (chunk) => stderr.push(chunk))
    child.once("error", reject)
    const timeout = setTimeout(() => child.kill("SIGTERM"), JOURNEY_TIMEOUT_MS)
    child.once("close", (exitCode) => {
      clearTimeout(timeout)
      resolvePromise({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      })
    })
  })
}

function parseModelFailure(status: number, responseText: string): NonNullable<JourneyRun["fatal"]> {
  let code: string | null = null
  let message = responseText.slice(0, 300)
  try {
    const body = JSON.parse(responseText) as {
      error?: { code?: string | null; type?: string; message?: string }
    }
    code = body.error?.code ?? body.error?.type ?? null
    message = body.error?.message?.slice(0, 300) ?? message
  } catch {
    // Preserve the bounded raw response when the provider did not return JSON.
  }
  return { source: "model_transport", status, code, message: `OpenAI ${status}: ${message}` }
}

/**
 * The travel agent's job, in dependency order.
 *
 * `verify` is a SQL existence check, and it is the real assertion. The first
 * version of this file scored journeys by looking for a substring in the model's
 * closing prose, and it produced false passes in both directions: `people-create`
 * was marked done because the answer contained "Ioana" — which it would have
 * whether or not a row was written — and `ops-departures` passed on the word
 * "departure" after a single `search_tools` call that queried nothing.
 *
 * An eval that grades an agent on what it SAYS rather than what it DID is worse
 * than no eval, because it reports green while the product is broken. So a write
 * journey is complete when the row exists, and a read journey is complete when
 * the answer contains a fact the model could only have obtained by calling a
 * tool. `expect` remains as a secondary prose check where a DB check cannot
 * express the question.
 */
/**
 * A per-run marker on every record this eval creates.
 *
 * Re-running with fixed names forced a choice between duplicate rows and deleting
 * the previous ones — and deleting them out of band corrupted the action ledger:
 * the created-target protocol replayed the original command, handed back the id
 * of the row that had just been deleted, and the agent truthfully reported a
 * success for a record that no longer existed. The ledger was right; the harness
 * was lying to it. Unique names per run mean the eval never has to delete
 * anything.
 */
const RUN_MARK = process.env.VOYANT_EVAL_MARK ?? String(Date.now()).slice(-6)

interface CapabilityJourney {
  id: string
  group: "commercial" | "proposal" | "amendment" | "supplier" | "contract" | "team-admin"
  domain: string
  task: string
  expect: string
  maxCalls: number
  /** SQL returning >0 rows when the work actually happened. */
  verify?: string
  /** Reads must reach the data; a journey that answers without dispatching is a miss. */
  requiresDispatch?: boolean
  /**
   * A reproducible, unfixed surface gap. Asserted to keep FAILING, so closing it
   * turns the suite red and prompts promotion — an eval that quietly stops
   * exercising a known bug is how the bug returns.
   */
  knownGap?: string
  /**
   * Runs and is reported, but its outcome is not asserted, because it genuinely
   * varies run to run.
   *
   * `knownGap` asserts a journey KEEPS failing, which is right for a defect that
   * is reliably broken — it turns red when someone fixes it. It is wrong for a
   * journey that passes perhaps half the time: asserting failure makes the suite
   * red on a good run, and asserting success makes it red on a bad one. Both are
   * lies about a real state, which is "capable but unreliable".
   *
   * The honest fix is a pass RATE over N runs, which this harness does not do
   * yet. Until it does, these are measured and visible without gating, and the
   * printed report is where the variance shows.
   */
  intermittent?: string
}

/**
 * Journeys for one attempt. Parameterised by the mark so repeated attempts write
 * distinct records and never collide or have to be deleted — deleting rows out of
 * band once corrupted the action ledger's replay and made an agent truthfully
 * report success for a row that no longer existed.
 */
function buildJourneys(RUN_MARK: string): CapabilityJourney[] {
  return [
    {
      id: "people-create",
      group: "commercial",
      domain: "people",
      task: `Add a new private client named Ioana Marinescu${RUN_MARK} with email ioana.${RUN_MARK}@example.com. Confirm her id.`,
      expect: "ioana",
      maxCalls: 14,
      verify: `select 1 from people where last_name ilike '%marinescu${RUN_MARK}%'`,
    },
    {
      id: "people-find",
      group: "commercial",
      domain: "people",
      task: `Find the client Ioana Marinescu${RUN_MARK} and tell me her email address.`,
      expect: `ioana.${RUN_MARK}@example.com`,
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "product-create",
      group: "commercial",
      domain: "products",
      task: `Create a product called 'Capability Eval Tour ${RUN_MARK}', a guided road tour sold by date in EUR. Confirm its id.`,
      expect: `capability eval tour ${RUN_MARK}`,
      maxCalls: 18,
      verify: `select 1 from products where name ilike '%capability eval tour ${RUN_MARK}%'`,
    },
    {
      // A product is not sellable until it has an option, a bookable unit, and a price. This is
      // the setup an agent must infer from a booking refusal today — see the
      // booking-create note. Covering it explicitly is what makes the commercial
      // chain reachable end to end rather than blocked at the last step.
      id: "product-option-create",
      group: "commercial",
      domain: "products",
      // Publication is part of making a product sellable, and the booking refusal
      // only said so once its error stopped collapsing three causes into one
      // ("The product being booked was not found, or is not bookable... confirm the
      // product is published"). Authoring and publishing are separate lifecycle
      // steps by design — the guide says so — but nothing in create_product hints
      // that a booking will fail without the second one.
      // The task used to say "add an option called X", which manufactured the exact
      // bug it then tripped over: create_product already seeds a default option, so
      // the agent made a second one, put the unit there, and the booking resolved to
      // the empty default. A real operator makes the product SELLABLE; it does not
      // decide to create a second option first. Asking for the outcome rather than
      // the mechanism is also what lets this journey detect the default-option
      // problem instead of causing it.
      // Publication used to be asked for HERE, and it is not achievable here: a
      // scheduled product cannot be published until it has a future open
      // departure, and the departure journey runs next. The task was impossible
      // in the order given, so measuring it measured the ordering. Publication
      // now has its own journey after the departure exists, which is both the
      // real dependency and the order a person would work in.
      task: `Finish authoring 'Capability Eval Tour ${RUN_MARK}': add 1 adult bookable seat to its existing option, then set the product's flat sell price to 500 EUR. Do not publish it yet because its required departure is created in the next step. Confirm what you changed.`,
      expect: "option",
      maxCalls: 26,
      // Verify the UNIT, not the option. Checking for a product_options row made
      // this journey unfalsifiable: create_product seeds a default option, so the
      // row exists before the journey runs and the check passed while the agent got
      // stuck in the approval loop and created no unit at all. The thing that makes
      // a product structurally bookable is a unit, so that is what has to be asserted here;
      // product-reprice below asserts the separate flat sell price.
      // Asserts BOTH halves of the task, because checking only the unit made this
      // journey report 3/3 while the product stayed in `draft` — every one of the
      // nine products this harness has ever created is still draft, so the
      // publication half has never once succeeded. That false green was not
      // harmless: it is exactly why booking-create fails with "not bookable", and
      // it sent me looking downstream at invoices for a defect that lives here.
      // Same trap the note above describes for product_options; a verify that
      // covers part of the task is a verify that certifies the wrong thing.
      verify: `select 1 from option_units u
             join product_options o on o.id = u.option_id
             join products p on p.id = o.product_id
             where p.name ilike '%capability eval tour ${RUN_MARK}%'`,
      // Promoted from intermittent after the 2026-08-07 Terra measurement wrote
      // the unit and flat product price in all five isolated attempts (16-22 calls, no exhaustion).
      // The durable row remains the score; confident model prose is not evidence.
    },
    {
      // The simple product uses a flat package price. Keep this journey aligned
      // with the public Tool contract instead of asking update_option_unit for a
      // price field it does not expose and then falsely passing on unit existence.
      id: "product-reprice",
      group: "commercial",
      domain: "products",
      task: `Change the flat sell price of 'Capability Eval Tour ${RUN_MARK}' from 500 EUR to 650 EUR and confirm the updated price.`,
      expect: "650",
      maxCalls: 22,
      verify: `select 1 from products
             where name ilike '%capability eval tour ${RUN_MARK}%'
               and sell_amount_cents = 65000
               and sell_currency = 'EUR'`,
    },
    {
      // Ops write: a dated departure for the product just created. First journey
      // to depend on another journey's output rather than seeded data.
      id: "ops-departure-create",
      group: "commercial",
      domain: "ops",
      task: `Create a departure for the product 'Capability Eval Tour ${RUN_MARK}' on 2026-09-15 at 09:00 +03:00 in Europe/Bucharest with 20 seats available. Confirm the departure id.`,
      expect: "2026-09-15",
      maxCalls: 20,
      verify: `select 1 from availability_slots s join products p on p.id = s.product_id
             where p.name ilike '%capability eval tour ${RUN_MARK}%'`,
    },
    {
      // Publication, in the only position where it can succeed: after the priced
      // unit AND after the departure. `no_future_open_departure` is a blocking
      // readiness rule for scheduled products (#4030), so asking for publication
      // before the departure exists is asking for something the domain correctly
      // refuses — which is what the chain used to do.
      //
      // This is also the journey that proves the readiness refusal is legible.
      // It used to arrive as `[PROVIDER_ERROR] Product is not ready to publish`,
      // terminal and detail-free; it now names each blocking issue and what to do
      // about it, which is what let this ordering bug be diagnosed at all.
      id: "product-publish",
      group: "commercial",
      domain: "products",
      task: `Publish the product 'Capability Eval Tour ${RUN_MARK}' so it can be sold. If it is refused, read the reason, fix what it names, and try again. Confirm the final status.`,
      expect: "publish",
      maxCalls: 22,
      verify: `select 1 from products
             where name ilike '%capability eval tour ${RUN_MARK}%' and status = 'active'`,
    },
    {
      // The commercial commit point, and the first journey through the
      // confirmation/approval protocol. Depends on the person, the product AND the
      // departure — the multi-call orchestration #3921 Finding 2 is about.
      id: "booking-create",
      group: "commercial",
      domain: "bookings",
      // The task used to say "for 2 adults" and name nobody. The agent found the
      // client, called book_product, and then correctly stopped to ask who the two
      // adults were — a Booking carries Travelers with names and contact details,
      // and it cannot invent them. That was the journey being unrealistic, not the
      // surface being unhelpful: a real operator booking a trip knows who is going.
      task: `Book the product 'Capability Eval Tour ${RUN_MARK}' for the client Ioana Marinescu${RUN_MARK} (email ioana.${RUN_MARK}@example.com) on the 2026-09-15 departure. She travels with one companion, Andrei Popescu${RUN_MARK}; both are adults and Ioana is the lead traveller and the billing party. Confirm the booking reference.`,
      expect: "book",
      maxCalls: 24,
      // Promoted from intermittent after the 2026-08-07 Terra measurement created
      // a durable booking in all five attempts (17-26 calls, no exhaustion).
      // `book_product` owns the ordinary intent and derives protocol identity
      // server-side; this assertion keeps the full commercial chain gated.
      verify: `select 1 from bookings b join people pe on pe.id = b.person_id
             where pe.last_name ilike '%marinescu${RUN_MARK}%'`,
    },
    {
      // The last link in the commercial chain, and the one never exercised until
      // now — it was only ever in a scratchpad runner, so "invoice-issue is
      // untested" was true in the most literal sense: the journey did not exist.
      // Depends on booking-create, so it inherits whatever blocks that.
      id: "invoice-issue",
      group: "commercial",
      domain: "invoices",
      task: `Issue a proforma invoice dated 2026-08-09 and due 2026-09-15 for the booking belonging to Ioana Marinescu${RUN_MARK}. Confirm the document number.`,
      expect: "proforma",
      maxCalls: 24,
      verify: `select 1 from invoices i join bookings b on b.id = i.booking_id
             join people pe on pe.id = b.person_id
             where pe.last_name ilike '%marinescu${RUN_MARK}%'`,
      // First completed end to end once the harness supplied ordinary deployment
      // configuration (a default proforma number series) and Finance consumed the
      // approval id from the shared `_voyant` control. This is asserted now: a
      // future failure is a regression, though its rate remains capped by the
      // chained publication and booking journeys above it.
    },
    {
      // The contractual unwind of the commercial chain. The policy is assigned
      // before sale by `seedCancellationPolicy`, so this proves that the ordinary
      // product quote captured immutable terms and that cancellation evaluates,
      // approves, applies, and audits those exact terms rather than today's policy.
      id: "booking-cancel",
      group: "commercial",
      domain: "bookings",
      task: `Cancel the booking belonging to Ioana Marinescu${RUN_MARK} according to the cancellation terms agreed when it was booked. Complete any required approval and confirm the cancellation and refund entitlement. Do not pay the refund yet; that is a separate operator step.`,
      expect: "cancel",
      maxCalls: 30,
      verify: `select 1 from bookings b
             join people pe on pe.id = b.person_id
             join booking_activity_log a on a.booking_id = b.id
             where pe.last_name ilike '%marinescu${RUN_MARK}%'
               and b.status = 'cancelled'
               and a.metadata->'cancellationPolicyEntitlement'->>'status' = 'evaluated'
               and (a.metadata->'cancellationPolicyEntitlement'->>'refundCents')::int > 0`,
    },
    {
      id: "paid-refund",
      group: "commercial",
      domain: "invoices",
      task: `Pay the contractual refund for cancelled booking 'BK-REFUND-${RUN_MARK}' by bank transfer with reference 'SEPA-${RUN_MARK}'. Complete the required approval and confirm the exact amount paid and the original payment it reversed.`,
      expect: "refund",
      maxCalls: 20,
      verify: `select 1 from refund_settlements rs
             join payments p on p.id = rs.payment_id
             join invoices i on i.id = rs.invoice_id
             join bookings b on b.id = rs.booking_id
             join credit_notes cn on cn.id = rs.credit_note_id
             where b.booking_number = 'BK-REFUND-${RUN_MARK}'
               and rs.status = 'settled'
               and rs.method = 'bank_transfer'
               and rs.external_reference = 'SEPA-${RUN_MARK}'
               and rs.amount_cents = 32500
               and rs.currency = 'EUR'
               and rs.payment_id = p.id
               and p.amount_cents = 65000
               and cn.amount_cents = 32500`,
    },
    {
      id: "proposal-accept",
      group: "commercial",
      domain: "proposals",
      task: `Accept the sent proposal 'Capability Eval Proposal ${RUN_MARK}' for booking and prepare its reservation handoff. Complete any required approval and confirm the Booking Session id.`,
      expect: "session",
      maxCalls: 18,
      verify: `select 1 from proposals p
             join proposal_versions v on v.id = p.accepted_version_id
             join booking_sessions s on s.proposal_version_id = v.id
             where p.title = 'Capability Eval Proposal ${RUN_MARK}'
               and p.status = 'won'
               and v.status = 'accepted'
               and s.proposal_id = p.id`,
    },
    {
      id: "contracts-read",
      group: "commercial",
      domain: "contracts",
      task: "What contract templates exist? If there are none, say so explicitly.",
      expect: "template",
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "invoices-read",
      group: "commercial",
      domain: "invoices",
      task: "How many invoices exist, and what is the most recent one? If there are none, say so explicitly.",
      expect: "invoice",
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "ops-departures",
      group: "commercial",
      domain: "ops",
      task: "List the departures scheduled for the catalog. If there are none, say so explicitly.",
      expect: "departure",
      maxCalls: 14,
      requiresDispatch: true,
      // Was a documented gap: the agent answered "there are no tools available to
      // list departures, which suggests there are no departures scheduled" without
      // dispatching — a business claim from a discovery miss. Fixed by having the
      // harness read the server `instructions` on `initialize` like a real MCP
      // client, which is what the guide layer (voyant#3931) is for.
    },
    {
      id: "proposal-author",
      group: "proposal",
      domain: "proposals",
      task: `Author an open proposal named 'Independent Danube Journey ${RUN_MARK}' in pipeline 'Proposal Authoring ${RUN_MARK}' at stage 'Draft'. Set its description to 'Private Danube itinerary', pax count to 2, and currency to EUR. Add one free-text line named 'Private Danube touring' with quantity 2 and a unit price of 75000 cents in EUR. Then snapshot the proposal into its first draft version. Confirm the proposal id, version id, and total.`,
      expect: "independent danube journey",
      maxCalls: 20,
      verify: `select 1 from proposals p
             join proposal_products pp on pp.proposal_id = p.id
             join proposal_versions pv on pv.proposal_id = p.id
             where p.title = 'Independent Danube Journey ${RUN_MARK}'
               and p.status = 'open'
               and p.description = 'Private Danube itinerary'
               and p.pax_count = 2
               and p.value_currency = 'EUR'
               and pp.name_snapshot = 'Private Danube touring'
               and pp.quantity = 2
               and pp.unit_price_amount_cents = 75000
               and pp.currency = 'EUR'
               and pv.status = 'draft'
               and pv.total_amount_cents = 150000`,
    },
    {
      id: "booking-amend-traveler",
      group: "amendment",
      domain: "bookings",
      task: `Correct the first name of the traveler on confirmed booking 'BK-AMEND-${RUN_MARK}' from Mihai to Michael. Preview the traveler correction and then apply that exact proposed Booking revision without replacing the stable Booking. Confirm the Booking id, Amendment id, and final Booking revision.`,
      expect: "michael",
      maxCalls: 22,
      verify: `select 1 from bookings b
             join booking_travelers bt on bt.booking_id = b.id
             join booking_amendments ba on ba.booking_id = b.id
             where b.booking_number = 'BK-AMEND-${RUN_MARK}'
               and b.status = 'confirmed'
               and b.revision = 2
               and bt.first_name = 'Michael'
               and bt.last_name = 'Popescu'
               and ba.traveler_id = bt.id
               and ba.status = 'applied'
               and ba.base_booking_revision = 1
               and ba.result_booking_revision = 2`,
    },
    {
      id: "supplier-create",
      group: "supplier",
      domain: "suppliers",
      task: `Add 'Carpathian Transfers ${RUN_MARK}' to the supplier directory as an active transfer supplier. Their operational email is ops.${RUN_MARK}@carpathian.example, their default currency is EUR, and we pay them on 30-day terms. Confirm the supplier id and the recorded operating details.`,
      expect: "carpathian",
      maxCalls: 16,
      verify: `select 1 from suppliers s
             join supplier_directory_projections d on d.supplier_id = s.id
             where s.name = 'Carpathian Transfers ${RUN_MARK}'
               and s.type = 'transfer'
               and s.status = 'active'
               and s.default_currency = 'EUR'
               and s.payment_terms_days = 30
               and d.email = 'ops.${RUN_MARK}@carpathian.example'`,
    },
    {
      id: "supplier-find",
      group: "supplier",
      domain: "suppliers",
      task: `Find the supplier 'Danube Guides ${RUN_MARK}' and report their status, default currency, and operational email address.`,
      expect: `guides.${RUN_MARK}@danube.example`,
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "supplier-deactivate",
      group: "supplier",
      domain: "suppliers",
      task: `Deactivate the supplier 'Dormant Experiences ${RUN_MARK}' without changing its other directory details. Confirm its final lifecycle status.`,
      expect: "inactive",
      // The write itself completed by call 13 in the slowest measured trace; two
      // calls remain for the model's ordinary authoritative post-write read and
      // final answer. This is still a bounded basic lifecycle job, not an intent
      // sequence whose server-side orchestration would replace three writes.
      maxCalls: 16,
      verify: `select 1 from suppliers
             where name = 'Dormant Experiences ${RUN_MARK}' and status = 'inactive'`,
    },
    {
      id: "contract-template-create",
      group: "contract",
      domain: "contracts",
      task: `Create an active English customer contract template named 'Independent Travel Agreement ${RUN_MARK}' with slug 'independent-travel-agreement-${RUN_MARK}', description 'Customer terms for independent travel', and body '<h1>Independent Travel Agreement</h1><p>Traveler: {{travelerName}}</p>'. It must not be the default template. Confirm its id and current version.`,
      expect: "independent travel agreement",
      maxCalls: 16,
      verify: `select 1 from contract_templates t
             join contract_template_versions v on v.id = t.current_version_id
             where t.slug = 'independent-travel-agreement-${RUN_MARK}'
               and t.scope = 'customer'
               and t.language = 'en'
               and t.active = true
               and t.is_default = false
               and v.version = 1`,
    },
    {
      id: "contract-template-find",
      group: "contract",
      domain: "contracts",
      task: `Find the contract template 'Danube Charter Terms ${RUN_MARK}' and report its slug, scope, language, lifecycle status, and description.`,
      expect: `danube-charter-terms-${RUN_MARK}`,
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "contract-template-update",
      group: "contract",
      domain: "contracts",
      task: `Update the contract template 'Alpine Group Terms ${RUN_MARK}' so its description is 'Revised group terms ${RUN_MARK}' and its body is '<h1>Alpine Group Terms</h1><p>Revised terms for {{groupName}}</p>'. Preserve its name, slug, customer scope, English language, active status, and non-default status. Confirm the new version.`,
      expect: "revised",
      maxCalls: 18,
      verify: `select 1 from contract_templates t
             join contract_template_versions v on v.id = t.current_version_id
             where t.slug = 'alpine-group-terms-${RUN_MARK}'
               and t.description = 'Revised group terms ${RUN_MARK}'
               and t.body = '<h1>Alpine Group Terms</h1><p>Revised terms for {{groupName}}</p>'
               and v.version = 2
               and v.body = t.body`,
    },
    {
      id: "admin-settings-read",
      group: "team-admin",
      domain: "settings",
      task: "Report the operator's current name, contact email, default locale, and supported locales. If a value is not configured, say so explicitly.",
      expect: "operator",
      maxCalls: 10,
      requiresDispatch: true,
    },
    {
      id: "admin-settings-update",
      group: "team-admin",
      domain: "settings",
      task: `Update the operator profile name to 'Capability Travel ${RUN_MARK}', contact email to 'office.${RUN_MARK}@capability.example', and set both the supported locales and default locale to English. Preserve all other settings. Complete any required approval and confirm the saved values.`,
      expect: `capability travel ${RUN_MARK}`,
      maxCalls: 16,
      verify: `select 1 from operator_profile
             where name = 'Capability Travel ${RUN_MARK}'
               and email = 'office.${RUN_MARK}@capability.example'
               and default_locale = 'en'
               and supported_locales = '["en"]'::jsonb`,
    },
    {
      id: "team-roster-read",
      group: "team-admin",
      domain: "team",
      task: "List the current staff team roster and report each member's role and access status.",
      expect: "capability.eval@example.com",
      maxCalls: 10,
      requiresDispatch: true,
    },
    {
      id: "team-role-update",
      group: "team-admin",
      domain: "team",
      task: `Change the active team member Role Candidate ${RUN_MARK} (role.candidate.${RUN_MARK}@capability.example) from Editor to Viewer. Complete any required approval and confirm the saved role.`,
      expect: "viewer",
      maxCalls: 16,
      verify: `select 1 from user_profiles
             where id = 'user_team_role_${RUN_MARK}'
               and is_super_admin = false
               and permissions = '["*:read", "*:search"]'::jsonb`,
    },
  ]
}

/**
 * How many times each journey runs.
 *
 * At n=1 this harness cannot tell a fix from a coin flip, and that has already
 * caused several wrong attributions: a change would look like an improvement, the
 * next run would look like a regression, and both were variance. A model driving
 * a multi-step write is genuinely stochastic, so the only honest score is a pass
 * RATE. Reads settle at 1/1; the writes are where the spread lives.
 *
 * Default 1 keeps an ordinary run cheap. Set VOYANT_EVAL_RUNS=5 when measuring a
 * change to the write path — that is the only setting whose numbers mean anything.
 */
const RUNS = Math.max(1, Number(process.env.VOYANT_EVAL_RUNS ?? "1"))
const JOURNEY_FILTER = process.env.VOYANT_EVAL_JOURNEY?.trim()
const GROUP_FILTER = process.env.VOYANT_EVAL_GROUP?.trim()

function selectedJourneys(mark: string): CapabilityJourney[] {
  const journeys = buildJourneys(mark)
  if (JOURNEY_FILTER && GROUP_FILTER) {
    throw new Error("VOYANT_EVAL_JOURNEY and VOYANT_EVAL_GROUP are mutually exclusive")
  }
  if (!JOURNEY_FILTER && !GROUP_FILTER) {
    return journeys.filter(({ group }) => group === "commercial")
  }
  const selected = JOURNEY_FILTER
    ? journeys.filter(({ id }) => id === JOURNEY_FILTER)
    : journeys.filter(({ group }) => group === GROUP_FILTER)
  if (selected.length === 0) {
    throw new Error(
      JOURNEY_FILTER
        ? `Unknown MCP capability journey: ${JOURNEY_FILTER}`
        : `Unknown MCP capability group: ${GROUP_FILTER}`,
    )
  }
  if (JOURNEY_FILTER && selected[0]?.group === "commercial") {
    throw new Error(
      `Commercial journey ${JOURNEY_FILTER} depends on the preceding chain; run the commercial group instead of an isolated journey.`,
    )
  }
  return selected
}

/** Shape only — used to drive `it.each`. Outcomes live in `passes`. */
const JOURNEYS = selectedJourneys(RUN_MARK)

/** Every attempt, in order, per journey. */
const attempts = new Map<string, JourneyRun[]>()
const passes = new Map<string, boolean[]>()
const runs = new Map<string, JourneyRun>()
const verified = new Map<string, boolean>()

/** Row count across the shapes a driver may return. */
function rowCount(rows: unknown): number {
  if (Array.isArray(rows)) return rows.length
  const count = (rows as { rowCount?: number; length?: number } | null)?.rowCount
  return typeof count === "number" ? count : ((rows as { length?: number } | null)?.length ?? 0)
}

function firstRow(rows: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(rows)) return rows[0] as Record<string, unknown> | undefined
  const resultRows = (rows as { rows?: unknown[] } | null)?.rows
  return resultRows?.[0] as Record<string, unknown> | undefined
}

/**
 * Supplier-group fixtures are owned per journey. They deliberately do not depend
 * on the commercial chain: a failed product or booking attempt cannot hide a
 * supplier directory regression.
 */
async function seedSupplierJourney(journeyId: string, mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")
  if (journeyId === "supplier-create") return

  const fixture =
    journeyId === "supplier-find"
      ? {
          name: `Danube Guides ${mark}`,
          type: "guide" as const,
          status: "active" as const,
          defaultCurrency: "EUR",
          paymentTermsDays: 14,
          email: `guides.${mark}@danube.example`,
        }
      : journeyId === "supplier-deactivate"
        ? {
            name: `Dormant Experiences ${mark}`,
            type: "experience" as const,
            status: "active" as const,
            defaultCurrency: "RON",
            paymentTermsDays: 21,
            email: `ops.${mark}@dormant.example`,
          }
        : null
  if (!fixture) return

  const [supplier] = await verifyDb
    .insert(suppliers)
    .values({
      name: fixture.name,
      type: fixture.type,
      status: fixture.status,
      defaultCurrency: fixture.defaultCurrency,
      paymentTermsDays: fixture.paymentTermsDays,
    })
    .returning({ id: suppliers.id })
  if (!supplier) throw new Error(`Cannot seed ${journeyId}`)
  await verifyDb.insert(supplierDirectoryProjections).values({
    supplierId: supplier.id,
    email: fixture.email,
  })
}

async function seedProposalAuthoring(mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")
  const pipeline = await proposalsService.createPipeline(verifyDb, {
    entityType: "proposal",
    name: `Proposal Authoring ${mark}`,
    isDefault: false,
    sortOrder: 0,
  })
  if (!pipeline) throw new Error("Cannot seed proposal authoring pipeline")
  const stage = await proposalsService.createStage(verifyDb, {
    pipelineId: pipeline.id,
    name: "Draft",
    sortOrder: 0,
    probability: 20,
    isClosed: false,
    isWon: false,
    isLost: false,
  })
  if (!stage) throw new Error("Cannot seed proposal authoring stage")
}

/** A minimal real Booking aggregate for an isolated correction Amendment. */
async function seedBookingAmendment(mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")
  const [booking] = await verifyDb
    .insert(bookings)
    .values({
      bookingNumber: `BK-AMEND-${mark}`,
      sellCurrency: "EUR",
      status: "confirmed",
    })
    .returning({ id: bookings.id })
  if (!booking) throw new Error("Cannot seed booking Amendment")
  await verifyDb.insert(bookingTravelers).values({
    bookingId: booking.id,
    firstName: "Mihai",
    lastName: "Popescu",
    email: `mihai.${mark}@example.test`,
    personId: `pers_amendment_${mark}`,
    isPrimary: true,
  })
}

/** Contract-group fixtures are versioned through Legal's owning service. */
async function seedContractJourney(journeyId: string, mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")
  if (journeyId === "contract-template-create") return

  const fixture =
    journeyId === "contract-template-find"
      ? {
          name: `Danube Charter Terms ${mark}`,
          slug: `danube-charter-terms-${mark}`,
          description: `Active charter customer terms ${mark}`,
          body: "<h1>Danube Charter Terms</h1><p>Traveler: {{travelerName}}</p>",
        }
      : journeyId === "contract-template-update"
        ? {
            name: `Alpine Group Terms ${mark}`,
            slug: `alpine-group-terms-${mark}`,
            description: `Original group terms ${mark}`,
            body: "<h1>Alpine Group Terms</h1><p>Original terms for {{groupName}}</p>",
          }
        : null
  if (!fixture) return

  const template = await contractsService.createTemplate(verifyDb, {
    ...fixture,
    scope: "customer",
    language: "en",
    channelId: null,
    isDefault: false,
    active: true,
  })
  if (!template?.currentVersionId) throw new Error(`Cannot seed ${journeyId}`)
}

/** Staff authority and ordinary operator configuration for isolated admin jobs. */
async function seedTeamAdminJourney(journeyId: string, mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")
  const now = new Date()
  await verifyDb
    .insert(authUser)
    .values({
      id: "user_capability_eval",
      name: "Capability Evaluator",
      email: "capability.eval@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
  await verifyDb
    .insert(userProfilesTable)
    .values({
      id: "user_capability_eval",
      firstName: "Capability",
      lastName: "Evaluator",
      isSuperAdmin: true,
      permissions: ["*"],
    })
    .onConflictDoNothing()
  await verifyDb
    .insert(authAccount)
    .values({
      id: "account_capability_eval",
      accountId: "user_capability_eval",
      providerId: "credential",
      userId: "user_capability_eval",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
  if (journeyId === "admin-settings-read") {
    await verifyDb.insert(operatorProfile).values({
      name: "Capability Operator",
      email: "operator@capability.example",
      supportedLocales: ["en"],
      defaultLocale: "en",
    })
  }
  if (journeyId === "team-role-update") {
    const targetUserId = `user_team_role_${mark}`
    await verifyDb
      .insert(authUser)
      .values({
        id: targetUserId,
        name: `Role Candidate ${mark}`,
        email: `role.candidate.${mark}@capability.example`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    await verifyDb
      .insert(userProfilesTable)
      .values({
        id: targetUserId,
        firstName: "Role",
        lastName: `Candidate ${mark}`,
        isSuperAdmin: false,
        permissions: scopesForRole("editor"),
      })
      .onConflictDoNothing()
    await verifyDb
      .insert(authAccount)
      .values({
        id: `account_team_role_${mark}`,
        accountId: targetUserId,
        providerId: "credential",
        userId: targetUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }
}

/**
 * Ordinary deployment fixture, analogous to the default invoice number series.
 * Policy authoring is not the capability under test; cancellation of terms that
 * were actually sold is. Use Legal's real domain service so the quote path sees
 * the same published assignment as production.
 */
async function seedCancellationPolicy(mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")
  const productRows = await verifyDb.execute(
    sqlRaw.raw(`select id from products where name ilike '%capability eval tour ${mark}%' limit 1`),
  )
  const productId = firstRow(productRows)?.id
  if (typeof productId !== "string") {
    throw new Error(`Cannot seed cancellation policy: product ${mark} was not found`)
  }

  const policy = await policiesService.createPolicy(verifyDb, {
    kind: "cancellation",
    name: `Capability Eval Cancellation ${mark}`,
    slug: `capability-eval-cancellation-${mark.toLowerCase()}`,
    description: "50% cash refund at least 30 days before departure",
    language: "en",
  })
  if (!policy) throw new Error("Cannot seed cancellation policy")
  const version = await policiesService.createPolicyVersion(verifyDb, policy.id, {
    title: "Capability eval cancellation terms",
    body: "Cancel at least 30 days before departure for a 50% cash refund.",
  })
  if (!version) throw new Error("Cannot seed cancellation policy version")
  const rule = await policiesService.createPolicyRule(verifyDb, version.id, {
    ruleType: "window",
    label: "50% cash refund 30 days before departure",
    daysBeforeDeparture: 30,
    refundPercent: 5000,
    refundType: "cash",
    sortOrder: 0,
  })
  if (!rule) throw new Error("Cannot seed cancellation policy rule")
  const published = await policiesService.publishPolicyVersion(verifyDb, version.id)
  if (published.status !== "published") throw new Error("Cannot publish cancellation policy")
  const assignment = await policiesService.createPolicyAssignment(verifyDb, {
    policyId: policy.id,
    scope: "product",
    productId,
    priority: 100,
  })
  if (!assignment) throw new Error("Cannot assign cancellation policy")
  const resolved = await policiesService.resolvePolicy(verifyDb, {
    kind: "cancellation",
    productId,
    at: new Date().toISOString().slice(0, 10),
  })
  if (resolved?.policy.id !== policy.id) {
    throw new Error("Seeded cancellation policy is not applicable to the product")
  }
  const snapshot = await policiesService.captureCancellationPolicySnapshot(verifyDb, policy.id)
  if (!snapshot) throw new Error("Seeded cancellation policy cannot be captured")
}

async function seedPaidCancellationRefund(mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")
  const [booking] = await verifyDb
    .insert(bookings)
    .values({
      bookingNumber: `BK-REFUND-${mark}`,
      status: "cancelled",
      sellCurrency: "EUR",
      sellAmountCents: 65_000,
    })
    .returning()
  if (!booking) throw new Error("Cannot seed paid cancellation booking")
  await verifyDb.insert(bookingActivityLog).values({
    bookingId: booking.id,
    actorId: "user_capability_eval",
    activityType: "status_change",
    description: "Booking cancelled with evaluated contractual entitlement.",
    metadata: {
      oldStatus: "confirmed",
      newStatus: "cancelled",
      cancellationPolicyEntitlement: {
        status: "evaluated",
        asOf: "2026-08-10T00:00:00.000Z",
        currency: "EUR",
        totalCents: 65_000,
        refundCents: 32_500,
        knownRefundCents: 32_500,
        refundPercent: 50,
        refundType: "cash_or_credit",
        reasons: [],
        items: [],
      },
    },
  })
  const [invoice] = await verifyDb
    .insert(invoices)
    .values({
      invoiceNumber: `INV-REFUND-${mark}`,
      bookingId: booking.id,
      invoiceType: "invoice",
      status: "issued",
      currency: "EUR",
      issueDate: "2026-08-01",
      dueDate: "2026-08-08",
      subtotalCents: 65_000,
      taxCents: 0,
      totalCents: 65_000,
      paidCents: 0,
      balanceDueCents: 65_000,
    })
    .returning()
  if (!invoice) throw new Error("Cannot seed paid cancellation invoice")
  const payment = await financeService.createPayment(verifyDb, invoice.id, {
    amountCents: 65_000,
    currency: "EUR",
    paymentMethod: "bank_transfer",
    status: "completed",
    paymentDate: "2026-08-01",
    referenceNumber: `PAY-${mark}`,
  })
  if (!payment) throw new Error("Cannot seed original payment")
}

/**
 * A sent, snapshot-backed Proposal is the sale artifact this journey starts
 * from. Build it through Trips and Proposals services so acceptance exercises
 * the same frozen-line and total checks as production; raw fixture rows would
 * bypass the invariant the intent Tool exists to protect.
 */
async function seedProposalAcceptance(mark: string): Promise<void> {
  if (!verifyDb) throw new Error("Capability eval database is not mounted")

  const pipeline = await proposalsService.createPipeline(verifyDb, {
    entityType: "proposal",
    name: `Capability Eval Pipeline ${mark}`,
    isDefault: false,
    sortOrder: 0,
  })
  if (!pipeline) throw new Error("Cannot seed proposal pipeline")
  const stage = await proposalsService.createStage(verifyDb, {
    pipelineId: pipeline.id,
    name: "Sent",
    sortOrder: 0,
    isClosed: false,
    isWon: false,
    isLost: false,
  })
  if (!stage) throw new Error("Cannot seed proposal stage")

  const trip = await tripsService.createTrip(verifyDb, {
    title: `Capability Eval Trip ${mark}`,
    travelerParty: {
      billing: {
        contact: {
          firstName: "Ioana",
          lastName: `Proposal${mark}`,
          email: `proposal.${mark}@example.com`,
        },
      },
      travelers: [
        {
          firstName: "Ioana",
          lastName: `Proposal${mark}`,
          email: `proposal.${mark}@example.com`,
        },
        { firstName: "Andrei", lastName: `Proposal${mark}` },
      ],
    },
    constraints: {},
  })
  await tripsService.addComponent(verifyDb, {
    envelopeId: trip.envelope.id,
    sequence: 0,
    kind: "flight_placeholder",
    description: "Return flights and private touring",
    estimatedPricing: {
      currency: "EUR",
      subtotalAmountCents: 180_000,
      taxAmountCents: 0,
      totalAmountCents: 180_000,
      warnings: [],
    },
    metadata: {},
  })
  const snapshot = await tripsService.freezeTripSnapshot(verifyDb, {
    envelopeId: trip.envelope.id,
  })

  const proposal = await proposalsService.createProposal(verifyDb, {
    title: `Capability Eval Proposal ${mark}`,
    pipelineId: pipeline.id,
    stageId: stage.id,
    status: "open",
    valueAmountCents: 180_000,
    valueCurrency: "EUR",
    paxCount: 2,
    source: "capability_eval",
    sourceRef: mark,
    tags: [],
  })
  if (!proposal) throw new Error("Cannot seed proposal")
  const version = await proposalsService.createVersionSnapshotFromProposal(verifyDb, proposal.id)
  if (!version) throw new Error("Cannot seed proposal version")
  const applied = await proposalsService.applyTripSnapshotToProposalVersion(
    verifyDb,
    version.id,
    tripSnapshotToProposalVersionApply(snapshot),
  )
  if (!applied) throw new Error("Cannot apply Trip snapshot to proposal version")
  const sent = await proposalsService.sendProposalVersion(verifyDb, version.id, {
    validUntil: "2026-12-31",
  })
  if (sent?.status !== "sent") throw new Error("Cannot send proposal version")
}

/** Exactly the conditions `it.each` asserts, so the report can never disagree. */
function journeyPassed(journey: CapabilityJourney, run: JourneyRun): boolean {
  if (run.calls.length === 0 || run.exhausted || run.calls.length > journey.maxCalls) return false
  if (journey.verify) return verified.get(journey.id) === true
  if (journey.requiresDispatch) {
    const dispatched = run.calls.filter(
      (call) => call.name === "call_tool" || call.name.endsWith("_query"),
    )
    if (dispatched.length === 0) return false
  }
  return run.answer.toLowerCase().includes(journey.expect.toLowerCase())
}

function report(): string {
  const lines = [
    `MCP capability eval — real graph, real database, model=${MODEL} (voyant#3921)`,
    "  completion is the score; tokens are secondary",
  ]
  for (const journey of JOURNEYS) {
    const run = runs.get(journey.id)
    if (!run) {
      lines.push(`  ? ${journey.id.padEnd(18)} did not run`)
      continue
    }
    // The report must apply the SAME criteria as the assertion. It did not, and
    // printed ✓ for `ops-departures` on three consecutive runs that the suite
    // failed — a read journey that answered from the tool index without ever
    // dispatching. A report that disagrees with its own assertions is the same
    // defect this file was rewritten to remove, one level up.
    const outcomes = passes.get(journey.id) ?? []
    const passed = outcomes.filter(Boolean).length
    const done = outcomes.length > 0 ? passed === outcomes.length : journeyPassed(journey, run)
    const rate = outcomes.length > 1 ? ` ${passed}/${outcomes.length}` : ""
    const errs = run.calls.filter((c) => c.isError).length
    lines.push(
      `  ${done ? "✓" : outcomes.length && passed ? "~" : "✗"}${rate} ${journey.id.padEnd(18)} [${journey.domain.padEnd(9)}] ` +
        `calls=${String(run.calls.length).padStart(2)} errors=${errs} tokens=${run.tokens}` +
        (run.modelTransportRetries ? ` model-retries=${run.modelTransportRetries}` : "") +
        (run.exhausted ? " EXHAUSTED" : ""),
    )
    // Print the ARGUMENTS. "search_tools → gave up" and "search_tools(Ioana
    // Marinescu) → gave up" are the same line without them, and only the second
    // tells you the agent searched the tool catalog for a RECORD NAME.
    lines.push(
      `      ${
        run.calls
          .map((c) => {
            const detail = c.args.query ?? c.args.resource ?? c.args.name ?? ""
            return `${c.name}(${String(detail).slice(0, 40)})`
          })
          .join(" → ") || "(no tool calls)"
      }`,
    )
    if (!done) lines.push(`      answer: ${run.answer.slice(0, 220)}`)
    if (run.fatal) {
      lines.push(
        `      fatal: ${run.fatal.source} status=${run.fatal.status ?? "none"} code=${run.fatal.code ?? "none"}`,
      )
    }
    for (const failed of run.calls.filter((c) => c.isError)) {
      lines.push(`      ✗ ${failed.name}: ${failed.snippet.slice(0, 200)}`)
      // The error tells us which guard refused; the arguments tell us why. This
      // is especially important for `_voyant` protocol failures, where omitted,
      // misplaced and false control fields all produce the same error code.
      lines.push(`        args: ${JSON.stringify(failed.args).slice(0, 800)}`)
    }
    // Approval protocols often return a successful `approval_required` payload.
    // If the journey later fails, error-only logging hides the decisive call and
    // makes a stalled protocol look like "errors=0". Preserve a bounded trace of
    // every successful dispatch for failed journeys so the real-model run is
    // diagnosable without changing what the model itself saw.
    if (!done) {
      for (const call of run.calls.filter((c) => !c.isError)) {
        lines.push(
          `      · ${call.name} args=${JSON.stringify(call.args).slice(0, 500)} result=${call.snippet.slice(0, 300)}`,
        )
      }
    }
    // Across ALL attempts, not just the last. A 6/10 journey fails for a reason
    // the final transcript may not contain at all, and reading one sample to
    // explain an aggregate is how you end up fixing whichever failure happened to
    // land last. Distinct codes, with how often each occurred.
    const all = attempts.get(journey.id) ?? []
    if (all.length > 1) {
      const codes = new Map<string, number>()
      for (const attempt of all) {
        for (const call of attempt.calls.filter((c) => c.isError)) {
          const code = /\[([A-Z_]+)\]/.exec(call.snippet)?.[1] ?? "UNKNOWN"
          codes.set(code, (codes.get(code) ?? 0) + 1)
        }
        if (attempt.exhausted) codes.set("EXHAUSTED", (codes.get("EXHAUSTED") ?? 0) + 1)
      }
      if (codes.size > 0) {
        const summary = [...codes.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([code, n]) => `${code}×${n}`)
          .join(" ")
        lines.push(`      across ${all.length} attempts: ${summary}`)
      }
    }
  }
  return lines.join("\n")
}

function writeMachineReport(): void {
  if (!REPORT_FILE) return

  const destination = resolve(REPORT_FILE)
  const journeys = JOURNEYS.map((journey) => {
    const journeyAttempts = attempts.get(journey.id) ?? []
    const outcomes = passes.get(journey.id) ?? []
    return {
      id: journey.id,
      domain: journey.domain,
      classification: journey.knownGap
        ? "known-gap"
        : journey.intermittent
          ? "intermittent"
          : "gated",
      passCount: outcomes.filter(Boolean).length,
      attemptCount: outcomes.length,
      callBudget: journey.maxCalls,
      attempts: journeyAttempts.map((attempt, index) => ({
        index: index + 1,
        passed: outcomes[index] ?? false,
        calls: attempt.calls.length,
        errors: attempt.calls.filter((call) => call.isError).length,
        responseBytes: attempt.calls.reduce((sum, call) => sum + call.responseBytes, 0),
        tokens: attempt.tokens,
        modelTransportRetries: attempt.modelTransportRetries,
        fatal: attempt.fatal ?? null,
        exhausted: attempt.exhausted,
        withinCallBudget: attempt.calls.length <= journey.maxCalls,
        trace: attempt.calls.map((call) => ({
          name: call.name,
          isError: call.isError,
          responseBytes: call.responseBytes,
          args: JSON.stringify(call.args).slice(0, 1_000),
          result: call.snippet.slice(0, 1_000),
        })),
        answer: attempt.answer.slice(0, 2_000),
      })),
    }
  })
  const largestResponses = [...attempts.values()]
    .flat()
    .flatMap((attempt) => attempt.calls)
    .sort((left, right) => right.responseBytes - left.responseBytes)
    .slice(0, 10)
    .map((call) => ({ name: call.name, responseBytes: call.responseBytes, isError: call.isError }))
  const allCalls = [...attempts.values()].flat().flatMap((attempt) => attempt.calls)
  const responseFormats = measureResponseFormats(allCalls)

  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(
    destination,
    `${JSON.stringify(
      {
        schemaVersion: 5,
        provider: EVAL_PROVIDER,
        generatedAt: new Date().toISOString(),
        model: MODEL,
        reasoningEffort: REASONING_EFFORT,
        runMark: RUN_MARK,
        configuredRuns: RUNS,
        journeys,
        totals: {
          journeys: journeys.length,
          attempts: journeys.reduce((total, journey) => total + journey.attemptCount, 0),
          passes: journeys.reduce((total, journey) => total + journey.passCount, 0),
          calls: journeys.reduce(
            (total, journey) =>
              total + journey.attempts.reduce((sum, attempt) => sum + attempt.calls, 0),
            0,
          ),
          responseBytes: journeys.reduce(
            (total, journey) =>
              total + journey.attempts.reduce((sum, attempt) => sum + attempt.responseBytes, 0),
            0,
          ),
          tokens: journeys.reduce(
            (total, journey) =>
              total + journey.attempts.reduce((sum, attempt) => sum + attempt.tokens, 0),
            0,
          ),
          modelTransportRetries: journeys.reduce(
            (total, journey) =>
              total +
              journey.attempts.reduce((sum, attempt) => sum + attempt.modelTransportRetries, 0),
            0,
          ),
        },
        largestResponses,
        responseFormats,
      },
      null,
      2,
    )}\n`,
  )
  process.stdout.write(`machine report: ${destination}\n`)
}

describe.skipIf(!enabled)("MCP capability — a travel agent's job", () => {
  beforeAll(
    async () => {
      if (!enabled) return
      const app = await mountRealMcp()
      if (EVAL_PROVIDER === "codex") {
        codexServerUrl = await startCodexMcpServer(app)
        process.stdout.write(`Codex MCP bridge: ${codexServerUrl}\n`)
      }
      // Invoice numbering is deployment configuration, not part of the travel
      // agent's request to issue a proforma. A real agency configures this before
      // taking bookings; an empty disposable database does not. Seed the same
      // prerequisite through Finance's real service so this journey measures the
      // issue capability rather than whether a brand-new deployment was set up.
      await financeService.createInvoiceNumberSeries(verifyDb as NonNullable<typeof verifyDb>, {
        code: "CAPABILITY-PROFORMA",
        name: "Capability evaluation proformas",
        prefix: "PF",
        separator: "-",
        padLength: 6,
        currentSequence: 0,
        resetStrategy: "annual",
        resetAt: null,
        scope: "proforma",
        isDefault: true,
        externalProvider: null,
        externalConfigKey: null,
        active: true,
      })
      // Handshake first, like a real client: `instructions` is returned here and
      // nowhere else.
      const initialized = await readRpc(
        await app.request(
          "/",
          rpc("initialize", {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "voyant-capability-eval", version: "0.0.0" },
          }),
          TEST_ENV,
          TEST_CTX,
        ),
      )
      const serverInstructions = String(
        (initialized.result as { instructions?: string } | undefined)?.instructions ?? "",
      )
      process.stdout.write(`server instructions: ${serverInstructions.length} chars\n`)

      const listed = await readRpc(
        await app.request("/", rpc("tools/list", {}), TEST_ENV, TEST_CTX),
      )
      const tools = (
        (listed.result as { tools?: Array<Record<string, unknown>> } | undefined)?.tools ?? []
      ).map((tool) => ({
        type: "function" as const,
        name: String(tool.name),
        description: String(tool.description ?? "").slice(0, 1024),
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
      }))

      for (let attempt = 0; attempt < RUNS; attempt += 1) {
        // A fresh mark per attempt: distinct records, no collisions, nothing to
        // delete afterwards.
        const mark = RUNS === 1 ? RUN_MARK : `${RUN_MARK}${attempt}`
        const journeys = selectedJourneys(mark)

        for (const journey of journeys) {
          if (journey.group === "proposal") await seedProposalAuthoring(mark)
          if (journey.group === "amendment") await seedBookingAmendment(mark)
          if (journey.group === "supplier") await seedSupplierJourney(journey.id, mark)
          if (journey.group === "contract") await seedContractJourney(journey.id, mark)
          if (journey.group === "team-admin") await seedTeamAdminJourney(journey.id, mark)
          if (journey.id === "proposal-accept") await seedProposalAcceptance(mark)
          if (journey.id === "paid-refund") await seedPaidCancellationRefund(mark)
          let run: JourneyRun
          try {
            run = await runJourney({
              app,
              tools,
              task: journey.task,
              maxCalls: journey.maxCalls,
              serverInstructions,
            })
          } catch (err) {
            run = {
              calls: [],
              answer: `FATAL: ${String(err).slice(0, 300)}`,
              tokens: 0,
              exhausted: true,
              modelTransportRetries: 0,
              fatal: {
                source: "harness",
                status: null,
                code: null,
                message: String(err).slice(0, 300),
              },
            }
          }
          attempts.set(journey.id, [...(attempts.get(journey.id) ?? []), run])
          // Keep the LAST attempt as the representative transcript for the report.
          runs.set(journey.id, run)

          // Grade immediately, before the next journey can write a row that
          // accidentally satisfies this journey's assertion.
          let passed = false
          if (journey.verify) {
            const rows = await (verifyDb as { execute: (q: unknown) => Promise<unknown> }).execute(
              // `sql` is a TEMPLATE TAG — a plain string is read as a
              // template-strings array and only its first character is sent.
              sqlRaw.raw(journey.verify),
            )
            const databaseVerified = rowCount(rows) > 0
            verified.set(journey.id, databaseVerified)
            passed =
              databaseVerified &&
              run.calls.length > 0 &&
              !run.exhausted &&
              run.calls.length <= journey.maxCalls
          } else {
            passed = journeyPassed(journey, run)
          }
          passes.set(journey.id, [...(passes.get(journey.id) ?? []), passed])
          if (journey.id === "product-create" && passed) await seedCancellationPolicy(mark)
        }
      }
      process.stdout.write(`\n${report()}\n\n`)
      writeMachineReport()
    },
    JOURNEY_TIMEOUT_MS * JOURNEYS.length * RUNS,
  )

  afterAll(async () => {
    if (codexServer)
      await new Promise<void>((resolvePromise) => codexServer?.close(() => resolvePromise()))
    const dispose = dbClientDispose(verifyDb)
    if (dispose) await dispose()
  })

  it.each(
    JOURNEYS.filter((journey) => journey.intermittent),
  )("runs '$id' — outcome not asserted, see report", (journey) => {
    const run = runs.get(journey.id)
    expect(run, `${journey.id} did not run`).toBeDefined()
    expect(
      run?.calls.length,
      `${journey.id} made no tool calls at all, which is a failure even for an ` +
        "intermittent journey — it means the agent never reached the surface.",
    ).toBeGreaterThan(0)
  })

  it.each(
    JOURNEYS.filter((journey) => journey.knownGap && !journey.intermittent),
  )("still cannot complete '$id' — documented gap", (journey) => {
    const run = runs.get(journey.id)
    expect(run, `${journey.id} did not run`).toBeDefined()
    expect(
      run ? journeyPassed(journey, run) : false,
      `'${journey.id}' now SUCCEEDS (${journey.knownGap}). Verify across several runs, then ` +
        "remove its knownGap so it is asserted as a real journey.",
    ).toBe(false)
  })

  it.each(
    JOURNEYS.filter((journey) => !journey.knownGap && !journey.intermittent),
  )("completes '$id' [$domain]", (journey) => {
    const { id, expect: needle, verify, requiresDispatch } = journey
    const run = runs.get(id)
    expect(run, `${id} did not run`).toBeDefined()
    expect(run?.calls.length, `${id} answered without calling any tool`).toBeGreaterThan(0)

    const outcomes = passes.get(id) ?? []
    if (outcomes.length > 0) {
      // Every attempt must pass. A journey that works most of the time is not
      // working — that is precisely the state `intermittent` exists to describe,
      // and a gated journey has claimed it is past it.
      const failed = outcomes.length - outcomes.filter(Boolean).length
      expect(
        failed,
        `${id} failed ${failed} of ${outcomes.length} attempts. Last answer: ${run?.answer.slice(0, 240)}`,
      ).toBe(0)
      return
    }

    if (verify) {
      // The real assertion for a write: the row exists. Prose is not evidence.
      expect(
        verified.get(id),
        `${id} did not write its record. The agent said: ${run?.answer.slice(0, 300)}`,
      ).toBe(true)
      return
    }

    if (requiresDispatch) {
      // A read journey that never dispatched answered from the tool INDEX, not
      // from the data — the exact false pass this file used to produce.
      const dispatched = (run?.calls ?? []).filter(
        (call) => call.name === "call_tool" || call.name.endsWith("_query"),
      )
      expect(
        dispatched.length,
        `${id} answered without querying any data: ${run?.answer.slice(0, 300)}`,
      ).toBeGreaterThan(0)
    }

    expect(run?.answer.toLowerCase(), `${id}: ${run?.answer.slice(0, 300)}`).toContain(
      needle.toLowerCase(),
    )
  })
})
