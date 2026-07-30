import {
  AdminApiError,
  AdminApprovalRequiredError,
  type AnyOperation,
  approvalRequiredSchema,
  CAPABILITIES_PATH,
  type DeploymentCapabilities,
  deploymentCapabilitiesSchema,
  type InferInput,
  type InferOutput,
  type InferParams,
  toAdminError,
} from "@voyant-travel/admin-contracts"

import { type AdminAuth, authHeaders } from "./auth.js"

/**
 * Minimal `fetch` shape the client needs. Keeping it narrow (instead of the DOM
 * `fetch` type) keeps the package free of `lib.dom` and trivial to mock.
 */
export type FetchLike = (
  url: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string
  },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export interface AdminClientConfig {
  /** Base URL of the target admin deployment (or a broker forwarding to one). */
  baseUrl: string
  auth: AdminAuth
  /** Fetch implementation (defaults to `globalThis.fetch`). */
  fetch?: FetchLike
  /** Extra headers merged into every request. */
  headers?: Record<string, string>
  /** Produce an `Idempotency-Key` for an idempotent operation invocation. */
  idempotencyKey?: (operationId: string) => string
}

function resolveFetch(config: AdminClientConfig): FetchLike {
  const impl = config.fetch ?? (globalThis as { fetch?: FetchLike }).fetch
  if (!impl) {
    throw new Error("@voyant-travel/admin-react: no fetch implementation; pass config.fetch")
  }
  return impl
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

function toQueryString(input: Record<string, unknown>): string {
  const params: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return params.join("&")
}

function unwrapData(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data: unknown }).data
  }
  return raw
}

async function readJson(res: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

async function baseHeaders(config: AdminClientConfig): Promise<Record<string, string>> {
  return {
    accept: "application/json",
    ...config.headers,
    ...(await authHeaders(config.auth)),
  }
}

/** Build the operation executor bound to a client config. */
export function createExecutor(config: AdminClientConfig) {
  const doFetch = resolveFetch(config)

  return async function execute<D extends AnyOperation>(
    op: D,
    params: InferParams<D>,
    input?: InferInput<D>,
  ): Promise<InferOutput<D>> {
    let url = stripTrailingSlash(config.baseUrl) + op.path((params ?? {}) as InferParams<D>)
    const headers = await baseHeaders(config)
    let body: string | undefined

    if (input !== undefined) {
      const parsed = op.input.parse(input) as Record<string, unknown>
      if (op.inputLocation === "query") {
        const qs = toQueryString(parsed)
        if (qs) url += (url.includes("?") ? "&" : "?") + qs
      } else {
        headers["content-type"] = "application/json"
        body = JSON.stringify(parsed)
      }
    }

    if (op.idempotent && config.idempotencyKey) {
      headers["idempotency-key"] = config.idempotencyKey(op.id)
    }

    const res = await doFetch(url, { method: op.method, headers, body })
    const raw = await readJson(res)
    if (!res.ok) {
      throw new AdminApiError(res.status, toAdminError(res.status, raw))
    }

    // A gated operation may return HTTP 202 with an approval-required envelope
    // instead of the entity (agent/workflow callers on confirm/cancel etc.).
    // Surface it as a typed error so callers can continue the approval flow
    // rather than hit a generic output-parse failure.
    if (res.status === 202) {
      const approval = approvalRequiredSchema.safeParse(unwrapData(raw))
      if (approval.success) {
        throw new AdminApprovalRequiredError(approval.data)
      }
    }

    const payload = op.envelope === "data" ? unwrapData(raw) : raw
    return op.output.parse(payload) as InferOutput<D>
  }
}

/** Fetch the deployment's capability descriptor (`GET /v1/admin/_meta/capabilities`). */
export async function fetchCapabilities(
  config: AdminClientConfig,
): Promise<DeploymentCapabilities> {
  const doFetch = resolveFetch(config)
  const url = stripTrailingSlash(config.baseUrl) + CAPABILITIES_PATH
  const res = await doFetch(url, { method: "GET", headers: await baseHeaders(config) })
  const raw = await readJson(res)
  if (!res.ok) {
    throw new AdminApiError(res.status, toAdminError(res.status, raw))
  }
  return deploymentCapabilitiesSchema.parse(unwrapData(raw))
}
