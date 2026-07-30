/**
 * MCP transport instrumentation — one reviewable unit for what agents actually
 * do at the `tools/call` boundary.
 *
 * This hangs off the shipped vendor-neutral observability seam
 * (`@voyant-travel/hono/observability`, RFC #1553): the deployment registers one
 * {@link Reporter} and this module forwards normalized events to it. No new
 * logging framework, no vendor SDK, no `console.log`. `server.ts` calls in here;
 * the `requestId` correlation id is read from the ambient async-context store so
 * every event joins the same trace as the request's `X-Request-Id`.
 *
 * ## Why the HTTP boundary, not the dispatch funnel
 *
 * `dispatchToResult` only runs for a tool that exists, is authorized, and whose
 * arguments already passed the MCP SDK's input-schema check. The two
 * highest-signal events — a call to a tool NAME that does not exist, and an
 * argument-validation failure — are rejected by the SDK *before* the dispatch
 * handler is invoked, so dispatch never sees them. The per-request POST handler
 * in `server.ts` is the single place that observes all four outcomes, so the
 * instrumentation lives there and consumes the error CODE that dispatch already
 * writes into the result `_meta`.
 *
 * ## PII
 *
 * Per `docs/architecture/booking-pii.md`, telemetry carries shapes, names, and
 * codes — NEVER argument or result payloads. This module never reads tool
 * arguments or results: an event carries the tool NAME, the caller's identity
 * ids and granted scopes, a duration, an outcome, and an error CODE. The signal
 * string stamped on the event is derived only from the event kind, outcome, and
 * code, so it is safe to log verbatim.
 */
import {
  type ErrorEvent,
  getRequestId,
  noopReporter,
  type Reporter,
  safeCaptureException,
} from "@voyant-travel/hono/observability"
import type { ToolContext } from "@voyant-travel/tools"

/**
 * Marker key stamped on every emitted event's `context` so a deployment's
 * Reporter can route MCP telemetry apart from genuine exceptions.
 */
export const MCP_TELEMETRY_CONTEXT_KEY = "voyant.mcp" as const

/**
 * The four outcomes of a `tools/call`, kept distinct so `unknown_tool` and
 * `validation_error` — the naming and schema mismatches an agent hits — never
 * blur into a successful call.
 */
export type McpCallOutcome = "ok" | "tool_error" | "unknown_tool" | "validation_error"

/** Caller identity ids and granted scopes — never booking/traveller payloads. */
export interface McpCaller {
  actor?: string
  audience?: string
  tenantId?: string
  organizationId?: string
  scopes?: readonly string[]
}

export interface McpToolCallEvent {
  /** Invocation name the caller asked for — a NAME, never an argument value. */
  tool: string
  outcome: McpCallOutcome
  durationMs: number
  /** Whether the tool mutates state; lets a backend find sessions with no write. */
  write: boolean
  /** ToolError / provider code when the outcome is an error; omitted on success. */
  code?: string
  caller: McpCaller
}

export interface McpToolsListEvent {
  /** Byte length of the serialized manifest payload. */
  payloadBytes: number
  /** Number of tools the caller was authorized to see. */
  toolCount: number
  caller: McpCaller
}

/**
 * Non-fault signal carried in an {@link ErrorEvent.error} slot so MCP telemetry
 * rides the exception-shaped Reporter seam. Its message is derived only from the
 * event kind, outcome, and code — never from arguments or results — so it is
 * safe for a Reporter to log verbatim.
 */
export class McpTelemetrySignal extends Error {
  constructor(message: string) {
    super(message)
    this.name = "McpTelemetrySignal"
  }
}

export interface McpObserver {
  /** Emit one event per `tools/call`, including unknown-tool and validation misses. */
  toolCall(event: McpToolCallEvent): void
  /** Emit the size of a served `tools/list` / manifest payload. */
  toolsList(event: McpToolsListEvent): void
}

export interface McpObserverOptions {
  /** Observability sink; defaults to the no-op reporter so telemetry is opt-in. */
  reporter?: Reporter
  /** Logical app name stamped on emitted events. Defaults to `"voyant"`. */
  appName?: string
  /** Runtime hook to flush async reporters without blocking the response. */
  waitUntil?: (promise: Promise<unknown>) => void
}

/**
 * Build a per-request observer bound to the deployment's reporter. Capture is
 * best-effort: {@link safeCaptureException} never throws and never blocks the
 * response, so instrumentation can never break a `tools/call`.
 */
export function createMcpObserver(options: McpObserverOptions = {}): McpObserver {
  const reporter = options.reporter ?? noopReporter
  const app = options.appName ?? "voyant"
  const emit = (signal: string, context: Record<string, unknown>): void => {
    const event: ErrorEvent = {
      requestId: getRequestId() ?? "unknown",
      app,
      error: new McpTelemetrySignal(signal),
      context: { [MCP_TELEMETRY_CONTEXT_KEY]: context },
    }
    safeCaptureException(reporter, event, options.waitUntil)
  }
  return {
    toolCall(e) {
      emit(`mcp.tool_call ${e.outcome}${e.code ? ` ${e.code}` : ""}`, {
        event: "tool_call",
        tool: e.tool,
        outcome: e.outcome,
        durationMs: e.durationMs,
        write: e.write,
        ...(e.code ? { code: e.code } : {}),
        caller: e.caller,
      })
    },
    toolsList(e) {
      emit("mcp.tools_list", {
        event: "tools_list",
        payloadBytes: e.payloadBytes,
        toolCount: e.toolCount,
        caller: e.caller,
      })
    },
  }
}

/** Project the request context down to non-payload caller identity for telemetry. */
export function callerFromContext(
  ctx: Pick<ToolContext, "actor" | "audience" | "tenantId" | "organizationId" | "scopes">,
): McpCaller {
  return {
    ...(ctx.actor ? { actor: ctx.actor } : {}),
    ...(ctx.audience ? { audience: ctx.audience } : {}),
    ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
    ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    ...(ctx.scopes ? { scopes: [...ctx.scopes] } : {}),
  }
}

/** UTF-8 byte length of a value's JSON serialization — the payload's wire size. */
export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length
}

/** `_meta` key under which `dispatchToResult` records a domain ToolError code. */
const DISPATCH_ERROR_META_KEY = "voyant.travel/error"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Classify a `tools/call` JSON-RPC response into an {@link McpCallOutcome} and,
 * when it is an error, the domain error CODE — reading only shape and code, never
 * a payload value.
 *
 * The MCP SDK converts a call to an unknown tool or an argument-validation
 * failure into an `isError` result with no Voyant error `_meta`; a domain
 * failure surfaces the same `isError` shape but carries the code
 * `dispatchToResult` wrote into `_meta`. That distinction is what separates a
 * validation miss from a genuine tool error.
 */
export function classifyToolCallResult(
  response: unknown,
  known: boolean,
): { outcome: McpCallOutcome; code?: string } {
  if (!known) return { outcome: "unknown_tool" }
  const envelope = asRecord(response)
  const rpcError = asRecord(envelope?.error)
  if (rpcError) {
    const code = rpcError.code
    return { outcome: "tool_error", code: code === undefined ? undefined : String(code) }
  }
  const result = asRecord(envelope?.result)
  if (result?.isError !== true) return { outcome: "ok" }
  const dispatchError = asRecord(asRecord(result._meta)?.[DISPATCH_ERROR_META_KEY])
  const code = dispatchError?.code
  if (typeof code === "string" && code.length > 0) return { outcome: "tool_error", code }
  return { outcome: "validation_error" }
}
