/**
 * Response schemas and error plumbing shared by the allocation route families.
 *
 * Extracted from `routes-allocation.ts` when the departure-resource, batch
 * assignment, conflicts and plan-preview legs arrived: they are their own
 * `OpenAPIHono` sub-chain (the established per-family pattern in this bundle)
 * and need the same error union and resource schema.
 */

import { z } from "@hono/zod-openapi"
import type { Context } from "hono"

import type { Env } from "./routes-shared.js"
import { AllocationServiceError } from "./service-allocation.js"

export const errorResponseSchema = z.object({ error: z.string() })
/** Allocation service errors serialize `error` + an optional `detail` payload. */
export const allocationErrorSchema = z.object({
  error: z.string(),
  detail: z.unknown().optional(),
})
export const isoTimestamp = z.string()
/** Resource `flags` is an untyped jsonb record. */
export const flagsSchema = z.record(z.string(), z.unknown())

export const slotIdParamSchema = z.object({ id: z.string() })

// §17: `allocation_resources.$inferSelect` — timestamps serialize to strings.
export const allocationResourceSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  label: z.string().nullable(),
  capacity: z.number().int(),
  flags: flagsSchema,
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/**
 * Map an `AllocationServiceError` to its HTTP status (anything else re-throws to
 * the boundary). Returns `c.json(...)` — a typed response — so the `.openapi()`
 * handlers' declared 4xx schemas accept it. The status is narrowed to the
 * literal union the allocation routes actually declare (400/404/409/500) so the
 * shared helper's return composes with each leg's typed response union.
 */
export function handleAllocationRouteError(c: Context<Env>, error: unknown) {
  if (error instanceof AllocationServiceError) {
    return c.json(
      {
        error: error.message,
        ...(error.detail ? { detail: error.detail } : {}),
      },
      error.status as 400 | 404 | 409 | 500,
    )
  }
  throw error
}

/** One `application/json` error response entry keyed by an explicit status. */
export const errResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: allocationErrorSchema } },
})

/**
 * The error statuses `handleAllocationRouteError` can emit (an
 * `AllocationServiceError` maps to 400/404/409/500). Every leg that funnels
 * errors through that shared helper declares this full set inline (a spread
 * collapses the literal status keys `createRoute` needs) so the helper's typed
 * response union is a subset of each route's declared responses. `400` doubles
 * as the request-body validation failure surfaced by `openApiValidationHook`.
 */
export const allocationErrorResponses = {
  400: errResponse("invalid_request, or an allocation invariant was violated"),
  404: errResponse("The slot, traveler, resource, sharing group, or template was not found"),
  409: errResponse(
    "Resource over capacity, a revision precondition failed, or the fleet resource is double-booked",
  ),
  500: errResponse("The allocation operation could not be completed"),
}

/** Serialize a CSV body as a `text/csv` attachment via the typed `c.body(...)`. */
export function csvResponse(c: Context<Env>, csv: string, filename: string) {
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  })
}
