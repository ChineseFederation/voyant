import type { z } from "zod"

import { type PublicApiErrorEnvelope, parsePublicApiErrorEnvelope } from "./errors.js"

export type VoyantPublicApiFetcher = (url: string, init?: RequestInit) => Promise<Response>

export const defaultPublicApiFetcher: VoyantPublicApiFetcher = (url, init) =>
  fetch(url, { credentials: "include", ...init })

export class VoyantPublicApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly normalizedError: PublicApiErrorEnvelope | null

  constructor(
    message: string,
    status: number,
    body: unknown,
    normalizedError: PublicApiErrorEnvelope | null = parsePublicApiErrorEnvelope(body),
  ) {
    super(message)
    this.name = "VoyantPublicApiError"
    this.status = status
    this.body = body
    this.normalizedError = normalizedError
  }
}

export interface VoyantPublicApiClientOptions {
  baseUrl: string
  fetcher?: VoyantPublicApiFetcher
  headers?: HeadersInit
}

export interface PublicApiRequestOptions {
  headers?: HeadersInit
  idempotencyKey?: string
}

export type PublicApiQueryParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>

export function withPublicApiQueryParams(path: string, query?: object): string {
  if (!query) {
    return path
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query as Record<string, PublicApiQueryParamValue>)) {
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
  return serialized ? `${path}?${serialized}` : path
}

export async function publicApiFetchWithValidation<TOut>(
  path: string,
  schema: z.ZodType<TOut>,
  options: Required<Pick<VoyantPublicApiClientOptions, "baseUrl" | "fetcher">> &
    Pick<VoyantPublicApiClientOptions, "headers">,
  init?: RequestInit,
): Promise<TOut> {
  const url = joinUrl(options.baseUrl, path)
  const headers = new Headers(options.headers)

  for (const [key, value] of new Headers(init?.headers)) {
    headers.set(key, value)
  }

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await options.fetcher(url, { ...init, headers })
  if (!response.ok) {
    const body = await safeJson(response)
    throw new VoyantPublicApiError(
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
    throw new VoyantPublicApiError(
      `Voyant storefront response failed validation: ${parsed.error.message}`,
      response.status,
      body,
    )
  }

  return parsed.data
}

export function requestHeaders(options?: PublicApiRequestOptions): HeadersInit | undefined {
  if (!options?.headers && !options?.idempotencyKey) {
    return undefined
  }

  const headers = new Headers(options.headers)
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey)
  }
  return headers
}

function extractErrorMessage(status: number, statusText: string, body: unknown): string {
  const normalizedError = parsePublicApiErrorEnvelope(body)
  if (normalizedError) return normalizedError.message

  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error: unknown }).error
    if (typeof err === "string") return err
    if (typeof err === "object" && err !== null && "message" in err) {
      return String((err as { message: unknown }).message)
    }
  }

  return `Voyant storefront API error: ${status} ${statusText}`
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
