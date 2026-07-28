import type { StorageObject, StorageProvider, StorageUploadBody, UploadOptions } from "../types.js"

/**
 * Options for {@link createLocalStorageProvider}.
 */
export interface LocalStorageOptions {
  /** Provider name (defaults to `"local"`). */
  name?: string
  /**
   * Base URL used to construct the string returned from `signedUrl` and
   * `upload`. Defaults to `"local://"`. The final URL is `${baseUrl}${key}`.
   */
  baseUrl?: string
  /**
   * Function used to mint random keys when `UploadOptions.key` is not
   * provided. Defaults to `crypto.randomUUID()` via the global `crypto`.
   */
  generateKey?: () => string
}

interface StoredRecord {
  bytes: Uint8Array
  contentType?: string
  metadata?: Record<string, string>
}

async function opaqueBackendIdentity(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Create an in-memory storage provider. Useful for unit tests and for
 * locally running jobs without touching remote storage. Data is
 * kept in a `Map` held inside the closure and is lost when the process
 * exits.
 */
export function createLocalStorageProvider(options: LocalStorageOptions = {}): StorageProvider {
  const name = options.name ?? "memory"
  const baseUrl = options.baseUrl ?? "local://"
  const generateKey =
    options.generateKey ??
    (() => {
      const g = globalThis as { crypto?: { randomUUID?: () => string } }
      return g.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    })

  const store = new Map<string, StoredRecord>()

  function publicUrl(key: string): string {
    return `${baseUrl}${encodeKey(key)}`
  }

  async function upload(body: StorageUploadBody, opts: UploadOptions = {}): Promise<StorageObject> {
    const key = opts.key ?? generateKey()
    const bytes = await toBytes(body)
    const record: StoredRecord = { bytes }
    if (opts.contentType !== undefined) record.contentType = opts.contentType
    if (opts.metadata !== undefined) record.metadata = opts.metadata
    store.set(key, record)
    return { key, url: publicUrl(key) }
  }

  return {
    name,
    resolveBackendIdentity: () => opaqueBackendIdentity(`local:${baseUrl}`),
    publicUrl,
    upload,
    async delete(key) {
      store.delete(key)
    },
    async signedUrl(key) {
      return publicUrl(key)
    },
    async get(key) {
      const record = store.get(key)
      if (!record) return null
      // Copy into a fresh ArrayBuffer so downstream mutation can't corrupt the store.
      const copy = new Uint8Array(record.bytes.byteLength)
      copy.set(record.bytes)
      return copy.buffer
    },
  }
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

async function toBytes(body: StorageUploadBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  const buffer = await body.arrayBuffer()
  return new Uint8Array(buffer)
}
