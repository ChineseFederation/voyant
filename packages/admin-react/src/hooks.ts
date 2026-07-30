import {
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
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
  return useQuery({
    queryKey: adminQueryKey(op, vars),
    queryFn: () => client.execute(op, (vars?.params ?? {}) as InferParams<D>, vars?.input),
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
  return useMutation({
    mutationFn: (vars: AdminVars<D>) =>
      client.execute(op, (vars.params ?? {}) as InferParams<D>, vars.input),
    ...options,
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
