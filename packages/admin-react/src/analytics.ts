"use client"

import type { AnyOperation } from "./client/index.js"

/**
 * Operation-derived admin analytics facts.
 *
 * Every admin read and write goes through one operation descriptor, and a
 * descriptor already carries what the taxonomy needs: a dotted id whose prefix
 * is the resource, and an HTTP method that says what kind of write it was. So
 * the events are derived rather than hand-annotated at hundreds of call sites,
 * which is also what stops them drifting as operations are added.
 *
 * The event *names* stay as literals at the emission site in `hooks.ts` rather
 * than being computed here. `verify:analytics-conformance` reads `track()`
 * calls from the AST, so a computed name is an event the catalogue cannot see.
 */

/**
 * The resource an operation acts on: the leading dotted segments of its id.
 *
 * `bookings.cancel` → `bookings`; `finance.invoices.issue` →
 * `finance.invoices`. The last segment is the verb, so dropping it is what
 * leaves a stable resource dimension across an operation's whole verb set.
 */
export function adminResourceType(operation: AnyOperation): string {
  const segments = operation.id.split(".")
  return segments.length > 1 ? segments.slice(0, -1).join(".") : operation.id
}

/**
 * A stable code for a failed admin action.
 *
 * Never the message: a message is locale-dependent, changes with copy edits,
 * and is the thing that turns a breakdown into a text search. `AdminApiError`
 * carries a status and often a server `code`; anything else collapses to the
 * error's constructor name, which at least distinguishes a network failure
 * from a validation one.
 */
export function adminErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown"
  const candidate = error as { code?: unknown; status?: unknown; name?: unknown }
  if (typeof candidate.code === "string" && candidate.code.length > 0) return candidate.code
  if (typeof candidate.status === "number") return `http_${candidate.status}`
  return typeof candidate.name === "string" && candidate.name.length > 0
    ? candidate.name
    : "unknown"
}

/**
 * The result count of a search read, or `null` when the call was not a search.
 *
 * Detected from the operation's own input rather than annotated per call site:
 * a list operation that carries a non-empty `search`/`q`/`query` *is* a
 * search, and every packaged list page already sends one when the staff member
 * types in its filter box.
 *
 * The query text is never emitted. A staff search box is regularly typed a
 * customer name or an email address into, and the count is the signal anyway —
 * a run of zero-result searches is a direct product-gap report, and it does
 * not need the words to say so.
 */
export function adminSearchResultCount(input: unknown, output: unknown): number | null {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const term = record.search ?? record.q ?? record.query
  if (typeof term !== "string" || term.trim().length === 0) return null

  if (!output || typeof output !== "object") return null
  const envelope = output as { total?: unknown; data?: unknown }
  if (typeof envelope.total === "number") return envelope.total
  if (Array.isArray(envelope.data)) return envelope.data.length
  return Array.isArray(output) ? output.length : null
}
