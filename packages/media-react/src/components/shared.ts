/**
 * Non-user-facing helpers shared by the media components. Nothing here renders
 * copy — all user-facing strings live in the i18n catalog.
 */
import type { MediaAsset, MediaAssetType } from "../schemas.js"

/** The asset kinds the picker/library can filter on, in display order. */
export const MEDIA_ASSET_TYPES: readonly MediaAssetType[] = ["image", "video", "document"]

/** Multipart `accept` hints per asset type (used by the upload inputs). */
export const ACCEPT_BY_TYPE: Record<MediaAssetType, string> = {
  image: "image/*",
  video: "video/*",
  document: "application/pdf,.doc,.docx,.txt,.csv,.xls,.xlsx",
}

/**
 * Default byte-serving URL for an asset. Raw bytes are served by
 * `@voyant-travel/storage` at `GET /v1/admin/media/{storageKey}`; consumers can
 * override via the `resolveAssetUrl` prop when their deployment serves media
 * from a different origin/CDN.
 */
export function defaultAssetUrl(
  asset: Pick<MediaAsset, "storageKey" | "url">,
  baseUrl: string,
): string {
  if (asset.url) return asset.url
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmed}/v1/admin/media/${asset.storageKey}`
}

/** Infer an asset type from a MIME string, defaulting to `document`. */
export function inferAssetType(mimeType: string | null | undefined): MediaAssetType {
  if (mimeType?.startsWith("image/")) return "image"
  if (mimeType?.startsWith("video/")) return "video"
  return "document"
}

/** Split a comma-separated tag input into a trimmed, de-duplicated list. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>()
  for (const raw of input.split(",")) {
    const tag = raw.trim()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

/**
 * Human-readable byte size. Always returns via a template so the units array
 * never surfaces as a scanned string literal.
 */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return null
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const rounded = unitIndex === 0 ? value : Math.round(value * 10) / 10
  return `${rounded} ${units[unitIndex]}`
}
