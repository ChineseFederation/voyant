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
 * CAPPED by its upstream one: if product-option-create leaves no priced unit on
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
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createDbClient } from "@voyant-travel/db"
import { financeService } from "@voyant-travel/finance"
import { composeVoyantGraphRuntime } from "@voyant-travel/framework"
import { sql as sqlRaw } from "drizzle-orm"
import { Hono } from "hono"
import { beforeAll, describe, expect, it } from "vitest"

import { accessCatalog } from "../.voyant/access/selected-access-catalog.generated"
import {
  createGeneratedGraphRuntime,
  createGeneratedTestDeploymentResources,
} from "./api/generated-project-runtime.js"

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
const MODEL = process.env.VOYANT_EVAL_MODEL ?? "gpt-4o"
const enabled = Boolean(TEST_DATABASE_URL && apiKey)

/** A live model turn plus a real dispatch is slow; the default would time out on latency. */
const JOURNEY_TIMEOUT_MS = 180_000

const TEST_ENV = { DATABASE_URL: TEST_DATABASE_URL ?? "", VOYANT_API_KEY: "test" } as never
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

async function mountRealMcp(): Promise<Hono> {
  const selected = await createGeneratedTestDeploymentResources(createGeneratedGraphRuntime())
  const composed = await composeVoyantGraphRuntime({
    runtime: selected.runtime,
    capabilities: selected.capabilities,
    ports: selected.ports,
  })
  const routes = await composed.modules
    .find((module) => module.module.name === "mcp")
    ?.lazyAdminRoutes?.()
  if (!routes) throw new Error("selected graph did not expose MCP admin routes")

  const db = createDbClient(TEST_DATABASE_URL as string, {
    adapter: "node",
    nodeMaxConnections: 4,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  })
  verifyDb = db
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

interface ToolCallRecord {
  name: string
  args: Record<string, unknown>
  isError: boolean
  snippet: string
}
interface JourneyRun {
  calls: ToolCallRecord[]
  answer: string
  tokens: number
  exhausted: boolean
}

async function runJourney(input: {
  app: Hono
  tools: unknown[]
  task: string
  maxCalls: number
  /** The server's own `instructions`, exactly as a real MCP client surfaces them. */
  serverInstructions: string
}): Promise<JourneyRun> {
  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content:
        "You are the back-office agent for a travel operator, connected to its MCP server. " +
        "Use the tools to actually perform the work end to end. Never invent data. If a write " +
        "reports that confirmation or approval is required, follow the instructions in the " +
        "error and complete it. Finish by stating what you created, including any ids." +
        // A real MCP client reads `instructions` from `initialize` and puts it in
        // front of the model. This harness did not, which made it a WORSE client
        // than the ones we ship to — and the guide layer (voyant#3931) exists
        // precisely to orient the agent before its first call. Measuring a surface
        // while withholding its own operating instructions measures the harness.
        (input.serverInstructions
          ? `\n\n--- server instructions ---\n${input.serverInstructions}`
          : ""),
    },
    { role: "user", content: input.task },
  ]
  const calls: ToolCallRecord[] = []
  let tokens = 0

  for (let turn = 0; turn <= input.maxCalls; turn += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: input.tools,
        tool_choice: "auto",
        temperature: 0,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = (await res.json()) as {
      choices?: Array<{ message: Record<string, unknown> }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    tokens += (body.usage?.prompt_tokens ?? 0) + (body.usage?.completion_tokens ?? 0)
    const message = body.choices?.[0]?.message
    if (!message) throw new Error("OpenAI returned no message")
    messages.push(message)

    const toolCalls =
      (message.tool_calls as Array<{
        id: string
        function: { name: string; arguments: string }
      }>) ?? []
    if (toolCalls.length === 0) {
      return { calls, answer: String(message.content ?? ""), tokens, exhausted: false }
    }

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
      } catch {
        args = {}
      }
      const rpcBody = await readRpc(
        await input.app.request(
          "/",
          rpc("tools/call", { name: call.function.name, arguments: args }),
          TEST_ENV,
          TEST_CTX,
        ),
      )
      const result = rpcBody.result as
        | { isError?: boolean; content?: Array<{ text?: string }>; structuredContent?: unknown }
        | undefined
      const text = (
        result?.structuredContent !== undefined
          ? JSON.stringify(result.structuredContent)
          : (result?.content?.[0]?.text ?? JSON.stringify(rpcBody))
      ).slice(0, 12_000)
      calls.push({
        name: call.function.name,
        args,
        isError: result?.isError === true,
        snippet: text.slice(0, 300),
      })
      messages.push({ role: "tool", tool_call_id: call.id, content: text })
    }
  }
  return { calls, answer: "", tokens, exhausted: true }
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
      domain: "people",
      task: `Add a new private client named Ioana Marinescu${RUN_MARK} with email ioana.${RUN_MARK}@example.com. Confirm her id.`,
      expect: "ioana",
      maxCalls: 14,
      verify: `select 1 from people where last_name ilike '%marinescu${RUN_MARK}%'`,
    },
    {
      id: "people-find",
      domain: "people",
      task: `Find the client Ioana Marinescu${RUN_MARK} and tell me her email address.`,
      expect: `ioana.${RUN_MARK}@example.com`,
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "product-create",
      domain: "products",
      task: `Create a product called 'Capability Eval Tour ${RUN_MARK}', a guided road tour sold by date. Confirm its id.`,
      expect: `capability eval tour ${RUN_MARK}`,
      maxCalls: 18,
      verify: `select 1 from products where name ilike '%capability eval tour ${RUN_MARK}%'`,
    },
    {
      // A product is not sellable until it has an option and a priced unit. This is
      // the setup an agent must infer from a booking refusal today — see the
      // booking-create note. Covering it explicitly is what makes the commercial
      // chain reachable end to end rather than blocked at the last step.
      id: "product-option-create",
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
      task: `Make the product 'Capability Eval Tour ${RUN_MARK}' sellable: it needs a priced bookable unit (1 adult seat at 500 EUR) on its option, and a sell price on the product. Reuse the option it already has rather than creating another. Confirm what you changed.`,
      expect: "option",
      maxCalls: 26,
      // Verify the UNIT, not the option. Checking for a product_options row made
      // this journey unfalsifiable: create_product seeds a default option, so the
      // row exists before the journey runs and the check passed while the agent got
      // stuck in the approval loop and created no unit at all. The thing that makes
      // a product sellable is a priced unit, so that is what has to be asserted.
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
      // THE remaining blocker, and the one worth fixing next. Creating a priced
      // unit goes through confirmation AND approval, and the agent frequently loses
      // the thread in that loop: 21-24 calls, 200k+ tokens, and then it reports
      // "successfully published" having written no unit at all. Only the database
      // check catches that — the prose is confident either way.
      //
      // When it does complete, everything downstream works: booking-create has
      // produced a real booking (BK-2608-845755) end to end. So the write chain is
      // capable and unreliable, and the unreliability lives here, in the
      // approval/confirmation round trip rather than in any single tool.
      // One measured 27-call/280k-token exhaustion here was NOT the approval loop:
      // the agent called list_price_catalogs, which threw on its own output
      // because its hand-written catalogType enum shared two of seven values with
      // the price_catalog_type pgEnum. A read tool broken for most of the rows it
      // returns burns the budget of every journey that consults it, and it only
      // showed up on a database that happened to hold a `gross` catalog. Fixed;
      // pinned by a test in packages/commerce/src/tools.test.ts.
      intermittent:
        "priced-unit creation gets lost in the confirmation/approval loop — 20+ calls, " +
        "200k+ tokens, and it has reported success while writing nothing",
    },
    {
      // Exercises configure_option_units, the tool that replaced the preview/apply
      // pair. Added because its absence was the whole problem: the pair was removed
      // from the agent surface and the replacement was never once called across ten
      // runs, so nobody noticed it could not work at all — it was
      // confirmation-gated generically, which refuses the unconfirmed call before
      // the handler can return the plan that the confirmed call then requires. A
      // capability with no journey is a capability nobody is checking.
      id: "option-unit-reprice",
      domain: "products",
      task: `The adult seat on 'Capability Eval Tour ${RUN_MARK}' should now cost 650 EUR instead of 500. Change it, reviewing the before/after before you commit.`,
      expect: "650",
      maxCalls: 22,
      verify: `select 1 from option_units u
             join product_options o on o.id = u.option_id
             join products p on p.id = o.product_id
             where p.name ilike '%capability eval tour ${RUN_MARK}%'`,
    },
    {
      // Ops write: a dated departure for the product just created. First journey
      // to depend on another journey's output rather than seeded data.
      id: "ops-departure-create",
      domain: "ops",
      task: `Create a departure for the product 'Capability Eval Tour ${RUN_MARK}' on 2026-09-15 with 20 seats available. Confirm the departure id.`,
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
      domain: "bookings",
      // The task used to say "for 2 adults" and name nobody. The agent found the
      // client, called book_product, and then correctly stopped to ask who the two
      // adults were — a Booking carries Travelers with names and contact details,
      // and it cannot invent them. That was the journey being unrealistic, not the
      // surface being unhelpful: a real operator booking a trip knows who is going.
      task: `Book the product 'Capability Eval Tour ${RUN_MARK}' for the client Ioana Marinescu${RUN_MARK} (email ioana.${RUN_MARK}@example.com) on the 2026-09-15 departure. She travels with one companion, Andrei Popescu${RUN_MARK}; both are adults and Ioana is the lead traveller and the billing party. Confirm the booking reference.`,
      expect: "book",
      maxCalls: 24,
      // Reaches the real domain constraint and stops there:
      //   "This product has no bookable units on the selected option, so the
      //    booking would reserve nothing."
      // That is CORRECT — a product is not sellable until it has an option, a
      // priced unit, and capacity. The gap is that this journey does not create
      // them, not that the surface refuses. It is exactly the multi-write setup
      // #3921 Finding 2 is about: "book the product you just made" is four or five
      // prior writes an agent has to infer, and nothing in create_product says so.
      //
      // Two MCP-level defects surfaced on the way and are FIXED: the model called
      // `functions.book_product` (its own namespacing artifact) and got a bare
      // NOT_FOUND with no way back — it now gets "Call it as book_product" and
      // recovers; and CONFIRMATION_REQUIRED is reached and handled.
      //
      // product-option-create now creates the option, but a PRICED UNIT with
      // capacity is still missing, so the refusal above still stands. The wider
      // blocker is idempotency: 20 of the 23 create tools still advertise an
      // `idempotencyKey` the agent must invent, described only as "Must match the
      // admitted Tool invocation idempotency key" — meaningless to a caller. The
      // agent duly invents one, reuses it across a retry with different input, and
      // gets "Action ledger idempotency key was reused with a different
      // fingerprint". Observed on create_departure and create_product_option here.
      //
      // The fix is the one already applied to create_person/create_product/
      // create_departure, generalised: derive server-side everywhere, then strip
      // the field from the MCP-projected input schema (schema-projection.ts) so no
      // agent ever sees it. Both halves have to land together — stripping the field
      // while 20 tools still require it would break every one of them.
      verify: `select 1 from bookings b join people pe on pe.id = b.person_id
             where pe.last_name ilike '%marinescu${RUN_MARK}%'`,
      intermittent: "has booked end to end (BK-2608-845755); depends on the unit above",
    },
    {
      // The last link in the commercial chain, and the one never exercised until
      // now — it was only ever in a scratchpad runner, so "invoice-issue is
      // untested" was true in the most literal sense: the journey did not exist.
      // Depends on booking-create, so it inherits whatever blocks that.
      id: "invoice-issue",
      domain: "invoices",
      task: `Issue a proforma invoice for the booking belonging to Ioana Marinescu${RUN_MARK}. Confirm the document number.`,
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
      id: "contracts-read",
      domain: "contracts",
      task: "What contract templates exist? If there are none, say so explicitly.",
      expect: "template",
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "invoices-read",
      domain: "invoices",
      task: "How many invoices exist, and what is the most recent one? If there are none, say so explicitly.",
      expect: "invoice",
      maxCalls: 12,
      requiresDispatch: true,
    },
    {
      id: "ops-departures",
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

/** Shape only — used to drive `it.each`. Outcomes live in `passes`. */
const JOURNEYS = buildJourneys(RUN_MARK)

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

/** Exactly the conditions `it.each` asserts, so the report can never disagree. */
function journeyPassed(journey: CapabilityJourney, run: JourneyRun): boolean {
  if (run.calls.length === 0) return false
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

describe.skipIf(!enabled)("MCP capability — a travel agent's job", () => {
  beforeAll(
    async () => {
      if (!enabled) return
      const app = await mountRealMcp()
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
        function: {
          name: String(tool.name),
          description: String(tool.description ?? "").slice(0, 1024),
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
      }))

      for (let attempt = 0; attempt < RUNS; attempt += 1) {
        // A fresh mark per attempt: distinct records, no collisions, nothing to
        // delete afterwards.
        const mark = RUNS === 1 ? RUN_MARK : `${RUN_MARK}${attempt}`
        const journeys = buildJourneys(mark)

        for (const journey of journeys) {
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
            }
          }
          attempts.set(journey.id, [...(attempts.get(journey.id) ?? []), run])
          // Keep the LAST attempt as the representative transcript for the report.
          runs.set(journey.id, run)
        }

        // Grade this attempt against the DATABASE before the next one runs, so a
        // later attempt's rows can never satisfy an earlier attempt's check.
        for (const journey of journeys) {
          const run = runs.get(journey.id)
          let passed = false
          if (run) {
            if (journey.verify) {
              const rows = await (
                verifyDb as { execute: (q: unknown) => Promise<unknown> }
              ).execute(
                // `sql` is a TEMPLATE TAG — a plain string is read as a
                // template-strings array and only its first character is sent.
                sqlRaw.raw(journey.verify),
              )
              passed = rowCount(rows) > 0
              verified.set(journey.id, passed)
            } else {
              passed = journeyPassed(journey, run)
            }
          }
          passes.set(journey.id, [...(passes.get(journey.id) ?? []), passed])
        }
      }
      process.stdout.write(`\n${report()}\n\n`)
    },
    JOURNEY_TIMEOUT_MS * JOURNEYS.length * RUNS,
  )

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
