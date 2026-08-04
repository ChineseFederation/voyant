import type { z } from "zod"

export type VoyantFetcher = (url: string, init?: RequestInit) => Promise<Response>

export const defaultFetcher: VoyantFetcher = (url, init) =>
  fetch(url, { credentials: "include", ...init })

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function normalizePath(value: string): string {
  const path = value.startsWith("/") ? value : `/${value}`
  return trimTrailingSlash(path)
}

export interface AuthBasePathFetcherOptions {
  baseUrl: string
  authBasePath: string
  /**
   * Paths under `/auth` that are served by the deployment itself rather than by
   * the realm's Better Auth handler, so they keep the shared prefix. Given
   * `/status`, both `/auth/status` and `/auth/status?x=1` pass through, and so
   * does any nested path such as `/auth/api-tokens/key_1/rotate` for
   * `/api-tokens`.
   */
  sharedPaths?: readonly string[]
}

/**
 * Routes auth-react requests to a specific auth realm without changing other API calls.
 * The replacement is deliberately scoped to the configured API base URL so a customer
 * provider cannot accidentally rewrite an unrelated or admin-auth URL.
 */
export function createAuthBasePathFetcher(
  fetcher: VoyantFetcher,
  options: AuthBasePathFetcherOptions,
): VoyantFetcher {
  const baseUrl = trimTrailingSlash(options.baseUrl)
  const defaultAuthBaseUrl = `${baseUrl}/auth`
  const realmAuthBaseUrl = `${baseUrl}${normalizePath(options.authBasePath)}`
  const sharedPaths = (options.sharedPaths ?? []).map(normalizePath)

  return (url, init) => {
    const isDefaultAuthRequest =
      url === defaultAuthBaseUrl ||
      url.startsWith(`${defaultAuthBaseUrl}/`) ||
      url.startsWith(`${defaultAuthBaseUrl}?`)
    if (!isDefaultAuthRequest) return fetcher(url, init)

    const rest = url.slice(defaultAuthBaseUrl.length)
    const path = trimTrailingSlash(rest.split(/[?#]/)[0] ?? "")
    const isShared = sharedPaths.some((shared) => path === shared || path.startsWith(`${shared}/`))
    return fetcher(isShared ? url : `${realmAuthBaseUrl}${rest}`, init)
  }
}

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

export type QueryParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>

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

  if (response.status === 204) return schema.parse(undefined)

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

export function withQueryParams(path: string, query?: object): string {
  if (!query) {
    return path
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query as Record<string, QueryParamValue>)) {
    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item))
      }
      continue
    }

    params.set(key, String(value))
  }

  const serialized = params.toString()
  if (!serialized) {
    return path
  }

  return `${path}?${serialized}`
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
