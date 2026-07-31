import { z } from "zod"

/**
 * The framework's canonical offset-paginated list response envelope.
 *
 * Every admin list endpoint returns this exact shape:
 * `{ data, total, limit, offset }`. Before this contract existed the envelope
 * was copy-pasted per module (both as a server builder and as a client zod
 * schema) and had drifted (some count reads used `count`, others `total`).
 * Import from `@voyant-travel/types` on both the server and the `*-react`
 * client so the two stay in lock-step.
 */
export interface ListResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

/**
 * Pure builder for a {@link ListResponse}. Use it wherever a service needs to
 * assemble the envelope from already-resolved rows + a total.
 */
export function listResponse<T>(
  data: T[],
  opts: { total: number; limit: number; offset: number },
): ListResponse<T> {
  return {
    data,
    total: opts.total,
    limit: opts.limit,
    offset: opts.offset,
  }
}

/**
 * The framework's canonical offset-pagination query input.
 *
 * `limit` coerces to an int in `[1, 200]` (default 50); `offset` coerces to a
 * non-negative int (default 0). Domain list-query schemas should extend this
 * rather than re-declaring `limit`/`offset` privately.
 *
 * ## Row count is not a payload budget (voyant#3928)
 *
 * A row count is the wrong lever for bounding what a response costs an agent's
 * context: 200 bookings and 200 contact points are not remotely the same number
 * of bytes, so a single cap of 200 cannot mean the same thing for both. The real
 * ceiling on a tool response is therefore enforced at the MCP transport as a
 * **byte budget** — see `shapeResponse` / `DEFAULT_RESPONSE_BUDGET_BYTES` in
 * `@voyant-travel/mcp`, which row-truncates an over-budget list result with
 * guidance rather than clipping it silently. This `limit` stays a page-size
 * ergonomic (kept at 50/200 so REST callers and their tests are undisturbed);
 * the byte budget is what actually bounds the payload on the agent surface.
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type PaginationQuery = z.infer<typeof paginationSchema>

/**
 * Factory for the zod schema matching the {@link ListResponse} envelope around
 * a given item schema. Replaces the per-package `paginatedEnvelope` copies.
 */
export function listResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
}
