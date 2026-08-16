import type { z } from "zod"

/**
 * The fetch seam.
 *
 * Mirrors `packages/charters-react/src/client.ts` deliberately: a hook package
 * that invents its own transport is a hook package that behaves differently
 * from every other one on the same page, and the operator app binds one fetcher
 * for all of them.
 */
export type VoyantFetcher = (url: string, init?: RequestInit) => Promise<Response>

export const defaultFetcher: VoyantFetcher = (url, init) =>
  fetch(url, { credentials: "include", ...init })

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
    const error = (body as { error: unknown }).error
    if (typeof error === "string") return error
    if (typeof error === "object" && error !== null && "message" in error) {
      return String((error as { message: unknown }).message)
    }
  }
  return `Voyant API error: ${status} ${statusText}`
}

export interface FetchWithValidationOptions {
  baseUrl: string
  fetcher: VoyantFetcher
}

/**
 * Fetch and validate.
 *
 * The response is parsed against the schema rather than cast, because an
 * insurance policy read that silently drifts from the server's shape is the
 * kind of thing that surfaces as a blank premium on a booking page months
 * later.
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
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${base}${suffix}`
}

export interface InsuranceClientOptions {
  /** The admin API root, e.g. `/api/v1/admin`. */
  baseUrl: string
  fetcher?: VoyantFetcher
}

export function resolveInsuranceClient(
  options: InsuranceClientOptions,
): FetchWithValidationOptions {
  return { baseUrl: options.baseUrl, fetcher: options.fetcher ?? defaultFetcher }
}
