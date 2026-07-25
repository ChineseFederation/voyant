/**
 * Zod fetch client for the media-library admin API
 * (`/v1/admin/media-library/*`). The low-level `fetchWithValidation` /
 * `VoyantApiError` infra mirrors the other `*-react` clients; the typed
 * operation functions reuse the request schemas from
 * `@voyant-travel/media/validation` and validate responses against the wire
 * schemas in `./schemas`.
 */

import type {
  CreateMediaFolderInput,
  ListAssetUsageQuery,
  ListMediaAssetsQuery,
  ListMediaFoldersQuery,
  MediaAltTranslationInput,
  UpdateMediaAssetInput,
  UpdateMediaFolderInput,
} from "@voyant-travel/media/validation"
import type { z } from "zod"

import {
  assetUsageListResponseSchema,
  mediaAssetEnvelopeSchema,
  mediaAssetListResponseSchema,
  mediaFolderEnvelopeSchema,
  mediaFolderListResponseSchema,
  mediaFolderMemberEnvelopeSchema,
  removeFolderMemberResponseSchema,
  uploadMediaAssetResponseSchema,
} from "./schemas.js"

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

/** True when the failure is the service's delete-in-use guard (HTTP 409). */
export function isAssetInUseError(error: unknown): error is VoyantApiError {
  return error instanceof VoyantApiError && error.status === 409
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
  if (
    init?.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
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
  return serialized ? `${path}?${serialized}` : path
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

// ──────────────────────────────────────────────────────────────────
// Typed media-library operations
// ──────────────────────────────────────────────────────────────────

const ASSETS = "/v1/admin/media-library/assets"
const FOLDERS = "/v1/admin/media-library/folders"
const USAGE = "/v1/admin/media-library/usage"

/** List/search assets (filters: type, folderId, tag, mimeType, name; paginated). */
export function listMediaAssets(
  query: Partial<ListMediaAssetsQuery> | undefined,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(withQueryParams(ASSETS, query), mediaAssetListResponseSchema, options)
}

export function getMediaAsset(assetId: string, options: FetchWithValidationOptions) {
  return fetchWithValidation(`${ASSETS}/${assetId}`, mediaAssetEnvelopeSchema, options)
}

export interface UploadMediaAssetInput {
  file: File
  type: string
  name?: string
  altText?: string
  defaultLanguageTag?: string
  altTranslations?: MediaAltTranslationInput[]
  mimeType?: string
  tags?: string[]
  folderIds?: string[]
}

/** Upload an asset (multipart → dedup → store → catalogue). Returns the asset. */
export function uploadMediaAsset(
  input: UploadMediaAssetInput,
  options: FetchWithValidationOptions,
) {
  const form = new FormData()
  form.set("file", input.file)
  form.set("type", input.type)
  if (input.name) form.set("name", input.name)
  if (input.altText !== undefined) form.set("altText", input.altText)
  if (input.defaultLanguageTag) form.set("defaultLanguageTag", input.defaultLanguageTag)
  if (input.altTranslations?.length) {
    form.set("altTranslations", JSON.stringify(input.altTranslations))
  }
  if (input.mimeType) form.set("mimeType", input.mimeType)
  if (input.tags?.length) form.set("tags", input.tags.join(","))
  if (input.folderIds?.length) form.set("folderIds", input.folderIds.join(","))
  return fetchWithValidation(ASSETS, uploadMediaAssetResponseSchema, options, {
    method: "POST",
    body: form,
  })
}

export function updateMediaAsset(
  assetId: string,
  input: UpdateMediaAssetInput,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(`${ASSETS}/${assetId}`, mediaAssetEnvelopeSchema, options, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteMediaAsset(assetId: string, options: FetchWithValidationOptions) {
  return fetchWithValidation(`${ASSETS}/${assetId}`, mediaAssetEnvelopeSchema, options, {
    method: "DELETE",
  })
}

export function listMediaFolders(
  query: Partial<ListMediaFoldersQuery> | undefined,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(
    withQueryParams(FOLDERS, query),
    mediaFolderListResponseSchema,
    options,
  )
}

export function createMediaFolder(
  input: CreateMediaFolderInput,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(FOLDERS, mediaFolderEnvelopeSchema, options, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateMediaFolder(
  folderId: string,
  input: UpdateMediaFolderInput,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(`${FOLDERS}/${folderId}`, mediaFolderEnvelopeSchema, options, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteMediaFolder(folderId: string, options: FetchWithValidationOptions) {
  return fetchWithValidation(`${FOLDERS}/${folderId}`, mediaFolderEnvelopeSchema, options, {
    method: "DELETE",
  })
}

export function addAssetToFolder(
  folderId: string,
  assetId: string,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(
    `${FOLDERS}/${folderId}/members`,
    mediaFolderMemberEnvelopeSchema,
    options,
    { method: "POST", body: JSON.stringify({ assetId }) },
  )
}

export function removeAssetFromFolder(
  folderId: string,
  assetId: string,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(
    `${FOLDERS}/${folderId}/members/${assetId}`,
    removeFolderMemberResponseSchema,
    options,
    { method: "DELETE" },
  )
}

export function listAssetUsage(
  query: Partial<ListAssetUsageQuery> | undefined,
  options: FetchWithValidationOptions,
) {
  return fetchWithValidation(withQueryParams(USAGE, query), assetUsageListResponseSchema, options)
}
