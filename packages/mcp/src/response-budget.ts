/**
 * Transport-level response budget, `response_format`, and guided truncation
 * (voyant#3928, RFC voyant#3921 Finding 7).
 *
 * Tool responses used to be uncapped: a single `list_bookings` at the maximum
 * page size could put more into an agent's context than the entire tool catalog,
 * and — unlike the catalog — that cost is charged on EVERY call. This module caps
 * the serialized size of a result and shapes list-shaped payloads, and it is
 * applied in `dispatch.ts` where the MCP envelope is built, so every tool is
 * covered uniformly rather than relying on each domain to remember.
 *
 * Two levers:
 *
 * - **Budget.** {@link shapeResponse} trims whole rows from a list result until
 *   the serialized envelope (structured content + text) fits the configured byte
 *   budget. Truncation is **guided, never silent**: a trimmed result states how
 *   many rows it is showing of the total and which of the tool's own input
 *   filters would narrow it. A silently clipped array makes a model conclude it
 *   has seen everything, which is worse than an error — so the guidance rides in
 *   the text content and in `_meta`, and the call stays a success.
 *
 * - **`response_format`.** `concise` (the default for list tools) renders the
 *   text content as compact rows projected to their POPULATED scalar fields —
 *   null and nested fields, which carry little selection signal, are omitted;
 *   `detailed` renders the full nested records. Only the TEXT content is
 *   projected — the `structuredContent` always carries the full-field rows
 *   (row-truncated), so it stays valid against the tool's untouched output schema
 *   and a caller that needs every field still has it. Whole rows are dropped
 *   identically from both, so the two never describe different result sets.
 *
 * ## PII
 *
 * Per `docs/architecture/booking-pii.md` this module measures byte lengths and
 * copies field values while shaping, but never logs or echoes a payload: nothing
 * here writes to a logger or telemetry sink. The domain has already applied its
 * redaction before the value reaches dispatch.
 */
import { z } from "@hono/zod-openapi"
import { TOOL_ACTION_INVOCATION_FIELD } from "@voyant-travel/tools"

import { isRecord } from "./guards.js"

/**
 * Default ceiling for a serialized tool response, in bytes. ~24 KB is roughly
 * 6k tokens at 4 bytes/token — an order of magnitude below the old ~339 KB tool
 * catalog, while still comfortably fitting a default page of typical rows.
 * Deployment-configurable through `McpApiRoutesOptions.responseBudgetBytes`.
 */
export const DEFAULT_RESPONSE_BUDGET_BYTES = 24_000

/** The input field a caller sets to choose a response verbosity. */
export const RESPONSE_FORMAT_FIELD = "response_format"

/** `_meta` key under which {@link shapeResponse} records what it truncated. */
export const RESPONSE_TRUNCATION_META_KEY = "voyant.travel/truncation"

export type ResponseFormat = "concise" | "detailed"

/**
 * The `response_format` input schema added to list-shaped tools. Defaulting to
 * `concise` is the point: published guidance measures the same result at ~72
 * tokens concise vs ~206 detailed, and we used to always send detailed.
 */
export const responseFormatSchema = z
  .enum(["concise", "detailed"])
  .describe(
    "Response verbosity. concise (default) returns compact rows with scalar " +
      "fields only; detailed returns the full nested records.",
  )
  .default("concise")

/**
 * Does this tool's output schema match the canonical `ListResponse` envelope
 * (`{ data: T[], total, limit, offset }`)? That is the shape whose row count the
 * budget trims and the only shape `response_format` is advertised on.
 */
export function isListShapedOutput(schema: z.ZodType): boolean {
  try {
    const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as {
      type?: string
      properties?: Record<string, { type?: string }>
    }
    if (json.type !== "object" || !json.properties) return false
    const p = json.properties
    return (
      p.data?.type === "array" &&
      p.total !== undefined &&
      p.limit !== undefined &&
      p.offset !== undefined
    )
  } catch {
    return false
  }
}

/**
 * The candidate narrowing filters to name in a truncation notice: every
 * top-level input field that is not pagination, the reserved action-metadata
 * field, or `response_format`. Named filters ("narrow with `status`") beat
 * generic advice because they are the tool's real inputs.
 */
export function listFilterFieldsFromInput(schema: z.ZodType): string[] {
  let properties: Record<string, unknown> | undefined
  try {
    properties = (
      z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as {
        properties?: Record<string, unknown>
      }
    ).properties
  } catch {
    return []
  }
  if (!properties || typeof properties !== "object") return []
  const excluded = new Set(["limit", "offset", RESPONSE_FORMAT_FIELD, TOOL_ACTION_INVOCATION_FIELD])
  return Object.keys(properties).filter((key) => !excluded.has(key))
}

export interface ShapeResponseOptions {
  /** Chosen verbosity; a list tool defaults to `concise`, non-list stays detailed. */
  format: ResponseFormat | undefined
  /** Serialized byte ceiling for the whole result. */
  budgetBytes: number
  /** The tool's own input filter names, for guided truncation. */
  filterFields: readonly string[]
  /** Wrap pure data in the same MCP structured-content envelope dispatch uses. */
  toWire: (data: unknown) => Record<string, unknown>
  /**
   * Apply the concise projection to `structuredContent` too, not only the text
   * block.
   *
   * Off by default: a tool advertises its real output schema, and dropping fields
   * would make the structured result fail the SDK's validation. It is safe — and
   * necessary — for a `<domain>_query` tool, which advertises a permissive
   * `additionalProperties` output. Without it a client that reads
   * `structuredContent` (the modern MCP path) receives every null field on every
   * row and sees none of the concise saving.
   */
  conciseStructuredContent?: boolean
}

export interface ShapedResponse {
  /** The text content block. */
  text: string
  /** The structured-content envelope, schema-valid and row-truncated to budget. */
  structuredContent: Record<string, unknown>
  /** Present only when rows were dropped: what was withheld and how to narrow. */
  meta?: Record<string, unknown>
}

/**
 * Shape a dispatched domain value into the text + structured content the envelope
 * carries, enforcing the byte budget and `response_format`. A non-list value is
 * returned unchanged (its schema forbids dropping fields, and it is not the
 * payload Finding 7 is about) so behavior for every existing tool is preserved.
 */
export function shapeResponse(data: unknown, options: ShapeResponseOptions): ShapedResponse {
  const located = locatePrimaryArray(data)
  if (!located) {
    return { text: safeStringify(data), structuredContent: options.toWire(data) }
  }

  const { rows, total, rebuild } = located
  const format: ResponseFormat = options.format ?? "detailed"
  const n = rows.length

  const render = (count: number) => {
    const truncated = count < n
    const kept = rows.slice(0, count)
    const nextData = rebuild(kept)
    const wire = options.toWire(
      format === "concise" && options.conciseStructuredContent
        ? rebuild(kept.map((row) => conciseRow(row)))
        : nextData,
    )
    const notice = truncated
      ? buildTruncationNotice({ shown: count, total, filterFields: options.filterFields })
      : undefined
    const text = renderText(nextData, format) + (notice ? `\n\n${notice}` : "")
    const bytes = byteLength(JSON.stringify(wire)) + byteLength(text)
    return { wire, text, bytes }
  }

  const full = render(n)
  if (full.bytes <= options.budgetBytes) {
    return { text: full.text, structuredContent: full.wire }
  }

  // Largest prefix of rows whose serialized envelope fits the budget. render(0)
  // is a near-empty array, so a fit always exists and truncation never errors.
  let low = 0
  let high = n
  let best = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (render(mid).bytes <= options.budgetBytes) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  const chosen = render(best)
  return {
    text: chosen.text,
    structuredContent: chosen.wire,
    meta: {
      [RESPONSE_TRUNCATION_META_KEY]: {
        returned: best,
        total,
        withheld: n - best,
        reason: "response_budget",
        guidance: narrowingGuidance(options.filterFields),
      },
    },
  }
}

interface LocatedArray {
  rows: unknown[]
  total: number
  rebuild: (rows: unknown[]) => unknown
}

/** Find the trimmable row array: a bare array result, or a `ListResponse.data`. */
function locatePrimaryArray(data: unknown): LocatedArray | undefined {
  if (Array.isArray(data)) {
    return { rows: data, total: data.length, rebuild: (rows) => rows }
  }
  if (isRecord(data) && Array.isArray(data.data)) {
    const total = typeof data.total === "number" ? data.total : data.data.length
    return { rows: data.data, total, rebuild: (rows) => ({ ...data, data: rows }) }
  }
  return undefined
}

function renderText(data: unknown, format: ResponseFormat): string {
  if (format === "concise") return JSON.stringify(conciseView(data))
  return safeStringify(data)
}

/** Project list rows to their populated scalar top-level fields for concise text. */
function conciseView(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(conciseRow)
  if (isRecord(data) && Array.isArray(data.data)) {
    return { ...data, data: data.data.map(conciseRow) }
  }
  return data
}

function conciseRow(row: unknown): unknown {
  if (!isRecord(row)) return row
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    // Keep populated scalars; drop null and nested (object/array) fields, which
    // dominate the byte cost and carry little tool-selection signal.
    if (isScalar(value)) out[key] = value
  }
  return out
}

function isScalar(value: unknown): boolean {
  const t = typeof value
  return t === "string" || t === "number" || t === "boolean"
}

function buildTruncationNotice(input: {
  shown: number
  total: number
  filterFields: readonly string[]
}): string {
  return (
    `⚠ Response truncated to fit the response budget: showing ${input.shown} of ` +
    `${input.total} result(s). To retrieve the rest, ${narrowingGuidance(input.filterFields)}.`
  )
}

/** Human guidance naming real input filters where they exist, else generic advice. */
function narrowingGuidance(filterFields: readonly string[]): string {
  const priority = /status|state|date|from|to|type|category|kind|query|search|filter|q$/i
  const ranked = [...filterFields].sort(
    (a, b) => (priority.test(b) ? 1 : 0) - (priority.test(a) ? 1 : 0),
  )
  const picks = ranked.slice(0, 3)
  if (picks.length === 0) return "narrow your query or page with `offset`"
  return `narrow with ${picks.map((field) => `\`${field}\``).join(", ")} (or page with \`offset\`)`
}

/** UTF-8 byte length of a string — the payload's wire size, no payload logged. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
