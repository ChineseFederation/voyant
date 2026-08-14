import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import { isDistributionServiceRefusal } from "../service/errors.js"
import {
  updateChannelBookingLinkSchema,
  updateChannelCommissionRuleSchema,
  updateChannelContractSchema,
  updateChannelInventoryAllotmentSchema,
  updateChannelInventoryAllotmentTargetSchema,
  updateChannelInventoryReleaseRuleSchema,
  updateChannelProductMappingSchema,
  updateChannelSchema,
  updateChannelWebhookEventSchema,
} from "../validation.js"

export const batchIdsSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
})

const createBatchUpdateSchema = <TPatch extends z.ZodTypeAny>(patchSchema: TPatch) =>
  z.object({
    ids: batchIdsSchema.shape.ids,
    patch: patchSchema.refine((value) => Object.keys(value as Record<string, unknown>).length > 0, {
      message: "Patch payload is required",
    }),
  })

export const batchUpdateChannelSchema = createBatchUpdateSchema(updateChannelSchema)
export const batchUpdateChannelContractSchema = createBatchUpdateSchema(updateChannelContractSchema)
export const batchUpdateChannelCommissionRuleSchema = createBatchUpdateSchema(
  updateChannelCommissionRuleSchema,
)
export const batchUpdateChannelProductMappingSchema = createBatchUpdateSchema(
  updateChannelProductMappingSchema,
)
export const batchUpdateChannelBookingLinkSchema = createBatchUpdateSchema(
  updateChannelBookingLinkSchema,
)
export const batchUpdateChannelWebhookEventSchema = createBatchUpdateSchema(
  updateChannelWebhookEventSchema,
)
export const batchUpdateChannelInventoryAllotmentSchema = createBatchUpdateSchema(
  updateChannelInventoryAllotmentSchema,
)
export const batchUpdateChannelInventoryAllotmentTargetSchema = createBatchUpdateSchema(
  updateChannelInventoryAllotmentTargetSchema,
)
export const batchUpdateChannelInventoryReleaseRuleSchema = createBatchUpdateSchema(
  updateChannelInventoryReleaseRuleSchema,
)

/**
 * A per-id failure message. A service refusal carries wording written to be
 * read (the single-row route surfaces the same text as a 409 body); anything
 * else collapses to a generic string rather than leaking an internal error
 * through a 200 batch response.
 */
function toBatchError(error: unknown) {
  return isDistributionServiceRefusal(error) ? error.message : "Operation failed"
}

export async function handleBatchUpdate<TPatch, TRow>({
  db,
  ids,
  patch,
  update,
}: {
  db: PostgresJsDatabase
  ids: string[]
  patch: TPatch
  update: (db: PostgresJsDatabase, id: string, patch: TPatch) => Promise<TRow | null>
}) {
  // Every outcome carries `error`, null on success. Narrowing has to happen on
  // that and not on `row`: `TRow` is generic, so TypeScript cannot use it as a
  // discriminant, and the route declares `failed: { id, error: string }[]` —
  // narrowing that leaves `error` as `string | undefined` fails the response
  // type on all nine `/batch-update` legs.
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const row = await update(db, id, patch)
        return row ? { id, row, error: null } : { id, row: null, error: "Not found" }
      } catch (error) {
        // Per-id isolation. A refusal on one id (e.g. patching a
        // system-provisioned channel) belongs in that id's `failed` entry — it
        // must not reject the batch and discard the results of every other id.
        return { id, row: null, error: toBatchError(error) }
      }
    }),
  )

  const data = results.flatMap((result) => (result.row ? [result.row] : []))
  const failed = results.flatMap((result) =>
    result.error === null ? [] : [{ id: result.id, error: result.error }],
  )

  return {
    data,
    total: ids.length,
    succeeded: data.length,
    failed,
  }
}

export async function handleBatchDelete({
  db,
  ids,
  remove,
}: {
  db: PostgresJsDatabase
  ids: string[]
  remove: (db: PostgresJsDatabase, id: string) => Promise<{ id: string } | null>
}) {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const row = await remove(db, id)
        return row ? { id } : { id, error: "Not found" }
      } catch (error) {
        // Per-id isolation, as in `handleBatchUpdate`: one refused id (e.g. the
        // system-provisioned Direct channel) reports itself in `failed` instead
        // of rejecting the batch and discarding every other id's outcome.
        return { id, error: toBatchError(error) }
      }
    }),
  )

  const deletedIds = results.flatMap((result) => ("error" in result ? [] : [result.id]))
  const failed = results
    .filter((result): result is { id: string; error: string } => "error" in result)
    .map((result) => ({ id: result.id, error: result.error }))

  return {
    deletedIds,
    total: ids.length,
    succeeded: deletedIds.length,
    failed,
  }
}
