import {
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { useVoyantAnalytics } from "@voyant-travel/react"
import { adminErrorCode, adminResourceType, adminSearchResultCount } from "./analytics.js"
import type {
  AnyOperation,
  DeploymentCapabilities,
  InferInput,
  InferOutput,
  InferParams,
} from "./client/index.js"
import { useAdminClient } from "./provider.js"
import { ADMIN_QUERY_ROOT, adminQueryKey } from "./query-keys.js"

/**
 * Operation arguments: route `params` (e.g. `{ id }`) and the request `input`
 * (query for GET, body otherwise). Both optional — an operation may need
 * neither (a bare list), one, or both.
 *
 * Errors thrown by the underlying client are `AdminApiError` (non-2xx) or
 * `AdminApprovalRequiredError` (HTTP 202 on a gated action); both extend
 * `Error`, so the hooks type the error channel as `Error` and callers narrow
 * with `instanceof`.
 */
export interface AdminVars<D extends AnyOperation> {
  params?: InferParams<D>
  input?: InferInput<D>
}

/**
 * Read an operation through React Query. Intended for `read` (GET) descriptors;
 * the cache key is derived from the descriptor id + params + input via
 * {@link adminQueryKey}.
 */
export function useAdminQuery<D extends AnyOperation>(
  op: D,
  vars?: AdminVars<D>,
  options?: Omit<UseQueryOptions<InferOutput<D>, Error>, "queryKey" | "queryFn">,
): UseQueryResult<InferOutput<D>, Error> {
  const client = useAdminClient()
  const analytics = useVoyantAnalytics()
  return useQuery({
    queryKey: adminQueryKey(op, vars),
    queryFn: async () => {
      const result = await client.execute(op, (vars?.params ?? {}) as InferParams<D>, vars?.input)
      // Emitted from the query function, not from an effect on `data`: React
      // Query replays cached data on every mount, and an effect would report
      // one search again each time the page was revisited.
      const resultCount = adminSearchResultCount(vars?.input, result)
      if (resultCount !== null) {
        analytics.track("admin.search.performed", { result_count: resultCount })
      }
      return result
    },
    ...options,
  })
}

/**
 * Invoke a write/action operation through a React Query mutation.
 * `mutate`/`mutateAsync` take `{ params, input }`.
 */
export function useAdminMutation<D extends AnyOperation>(
  op: D,
  options?: Omit<UseMutationOptions<InferOutput<D>, Error, AdminVars<D>>, "mutationFn">,
): UseMutationResult<InferOutput<D>, Error, AdminVars<D>> {
  const client = useAdminClient()
  const analytics = useVoyantAnalytics()
  return useMutation({
    mutationFn: (vars: AdminVars<D>) =>
      client.execute(op, (vars.params ?? {}) as InferParams<D>, vars.input),
    ...options,
    // Layered over any caller-supplied handler rather than replacing it: the
    // spread above would otherwise let a call site silently opt its writes out
    // of the taxonomy just by wanting its own `onSuccess`.
    onSuccess: (data, variables, context, mutation) => {
      // Spelled out per branch rather than computed: the conformance checker
      // reads event names as string literals, and a name assembled at runtime
      // is a name the catalogue cannot see.
      const resource_type = adminResourceType(op)
      switch (op.method) {
        case "POST":
          analytics.track("admin.resource.created", { resource_type })
          break
        case "PATCH":
        case "PUT":
          analytics.track("admin.resource.updated", { resource_type })
          break
        case "DELETE":
          analytics.track("admin.resource.deleted", { resource_type })
          break
        default:
          break
      }
      options?.onSuccess?.(data, variables, context, mutation)
    },
    onError: (error, variables, context, mutation) => {
      analytics.track("admin.action.failed", {
        action: op.id,
        error_code: adminErrorCode(error),
      })
      options?.onError?.(error, variables, context, mutation)
    },
  })
}

/** Discover the deployment's capability descriptor through React Query. */
export function useCapabilities(
  options?: Omit<UseQueryOptions<DeploymentCapabilities, Error>, "queryKey" | "queryFn">,
): UseQueryResult<DeploymentCapabilities, Error> {
  const client = useAdminClient()
  return useQuery({
    queryKey: [ADMIN_QUERY_ROOT, "_capabilities"],
    queryFn: () => client.capabilities(),
    ...options,
  })
}
