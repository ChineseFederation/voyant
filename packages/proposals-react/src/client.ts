import type { z } from "zod"

/**
 * Fetcher signature — compatible with the Fetch API, `cross-fetch`, or any
 * custom wrapper. Consumers may pass their own to bake in authentication,
 * tracing, or base URL rewriting.
 */
export type VoyantFetcher = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Default fetcher — uses the global `fetch` with `credentials: "include"` so
 * session cookies are sent for same-origin deployments.
 */
export const defaultFetcher: VoyantFetcher = (url, init) =>
  fetch(url, { credentials: "include", ...init })

/**
 * Typed error thrown by `fetchWithValidation` when the API returns a non-2xx
 * response or when the body fails Zod validation.
 */
export class VoyantApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "VoyantApiError"
    this.status = status
    this.body = body
  }
}

function extractErrorMessage(status: number, statusText: string, body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error: unknown }).error
    if (typeof err === "string") return err
    if (typeof err === "object" && err !== null && "message" in err) {
      return String((err as { message: unknown }).message)
    }
  }
  return `Voyant API error: ${status} ${statusText}`
}

export interface FetchWithValidationOptions {
  baseUrl: string
  fetcher: VoyantFetcher
}

/**
 * Wraps a fetcher call, reads the JSON response, and validates it against a
 * Zod schema. Throws `VoyantApiError` on transport, status, or parse failures.
 */
export async function fetchWithValidation<TOut>(
  path: string,
  schema: z.ZodType<TOut>,
  options: FetchWithValidationOptions,
  init?: RequestInit,
): Promise<TOut> {
  const url = joinUrl(options.baseUrl, path)
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const response = await options.fetcher(url, { ...init, headers })

  if (!response.ok) {
    const body = await safeJson(response)
    throw new VoyantApiError(
      extractErrorMessage(response.status, response.statusText, body),
      response.status,
      body,
    )
  }

  if (response.status === 204) {
    return schema.parse(undefined)
  }

  const body = await safeJson(response)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new VoyantApiError(
      `Voyant API response failed validation: ${parsed.error.message}`,
      response.status,
      body,
    )
  }
  return parsed.data
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${trimmedPath}`
}
