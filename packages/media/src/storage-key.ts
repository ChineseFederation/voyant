/**
 * `@voyant-travel/media` storage-key derivation. The object key is the library's
 * only durable locator for an asset's bytes — delivery URLs are composed from it
 * per read against the configured origin, never persisted (voyant#3845) — so the
 * rules that shape a key live together here.
 */

import type { StorageUploadBody } from "@voyant-travel/storage"

/** All object keys minted by the library live under this servable prefix. */
export const MEDIA_STORAGE_KEY_PREFIX = "uploads/media/"

/**
 * Storage keys are content-addressed by checksum. Append the file extension so
 * the byte-serving route (`@voyant-travel/storage`, which sends
 * `X-Content-Type-Options: nosniff`) can infer the correct `Content-Type` from
 * the key and browsers render the asset instead of downloading octet-stream.
 */
const MEDIA_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
}

function storageKeyExtension(mimeType: string | null | undefined): string {
  const normalized = (mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
  const ext = MEDIA_EXTENSION_BY_MIME[normalized]
  return ext ? `.${ext}` : ""
}

/** The content-addressed object key for bytes with the given checksum/MIME. */
export function mediaStorageKey(checksum: string, mimeType: string | null | undefined): string {
  return `${MEDIA_STORAGE_KEY_PREFIX}${checksum}${storageKeyExtension(mimeType)}`
}

export async function toBytes(body: StorageUploadBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  return new Uint8Array(await body.arrayBuffer())
}

/** SHA-256 hex digest of the given bytes (org-global dedup key). */
export async function computeChecksum(body: StorageUploadBody): Promise<string> {
  const bytes = await toBytes(body)
  // Copy into a fresh ArrayBuffer-backed view so the digest arg is a concrete
  // BufferSource (Uint8Array<ArrayBufferLike>` isn't assignable under TS 6).
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
