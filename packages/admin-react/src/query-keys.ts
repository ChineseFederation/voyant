import type { AnyOperation, InferInput, InferParams } from "./client/index.js"

/** Root prefix for every admin-react query cache entry. */
export const ADMIN_QUERY_ROOT = "voyant-admin" as const

/**
 * Stable React Query key for an operation invocation, keyed by the operation
 * id plus its params and input. Two reads of the same descriptor with
 * different arguments cache separately, and invalidation can target a whole
 * operation (`[ADMIN_QUERY_ROOT, op.id]`) or one exact call.
 */
export function adminQueryKey<D extends AnyOperation>(
  op: D,
  vars?: { params?: InferParams<D>; input?: InferInput<D> },
): readonly [typeof ADMIN_QUERY_ROOT, string, unknown, unknown] {
  return [ADMIN_QUERY_ROOT, op.id, vars?.params ?? null, vars?.input ?? null]
}
