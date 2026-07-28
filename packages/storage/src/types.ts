/**
 * Accepted body shapes for uploads. Providers normalize to `Uint8Array`
 * or pass through to their native API.
 */
export type StorageUploadBody = ArrayBuffer | Uint8Array | Blob

/**
 * Options controlling an upload.
 */
export interface UploadOptions {
  /**
   * Override the object key. When omitted, providers generate a random
   * key (typically `${randomUUID()}` — UUID v4 where available).
   */
  key?: string
  /** MIME content type (e.g. `"image/png"`). */
  contentType?: string
  /** Custom metadata; persisted by providers that support it. */
  metadata?: Record<string, string>
}

/**
 * Result of a successful upload.
 */
export interface StorageObject {
  /** Object key inside the bucket/store. */
  key: string
  /**
   * Public URL for the object when the provider exposes one. Empty string
   * when the object is private and can only be accessed via `signedUrl`.
   *
   * Point-in-time only — do NOT persist it. The origin baked into this string
   * goes stale the moment the store's public hostname changes. Persist `key`
   * and re-derive through {@link StorageProvider.publicUrl} on every read.
   */
  url: string
}

/**
 * Pluggable object storage provider.
 *
 * Built-in implementations:
 * - `memory` — in-memory, for dev and tests
 * - `s3-compatible` — AWS S3 and compatible object stores via AWS SDK v3
 */
export interface StorageProvider {
  /** Diagnostic provider name (for example `"memory:media"`). */
  readonly name: string
  /** Resolve an opaque fingerprint of the complete backend routing/auth binding. */
  resolveBackendIdentity?(): Promise<string>
  /** Upload an object. */
  upload(body: StorageUploadBody, options?: UploadOptions): Promise<StorageObject>
  /**
   * Derive the stable public delivery URL for `key` from the provider's
   * *currently configured* origin. Returns `null` when this store has no public
   * origin (private bucket, or a gateway without a configured CDN base).
   *
   * Deliberately synchronous and pure so callers can derive on every read.
   * Catalogues must call this instead of persisting the absolute URL returned by
   * {@link upload}: a stored origin is invalidated wholesale by a CDN hostname
   * change and fails silently as broken media (voyant#3845).
   */
  publicUrl?(key: string): string | null
  /** Delete an object by key. No-op if the key does not exist. */
  delete(key: string): Promise<void>
  /**
   * Produce a time-limited URL that grants GET access to the object.
   * `expiresIn` is in seconds.
   */
  signedUrl?(key: string, expiresIn: number): Promise<string>
  /**
   * Fetch an object's bytes. Returns `null` when the object is absent.
   */
  get(key: string): Promise<ArrayBuffer | null>
}

/** Stable application-facing names for framework-owned object stores. */
export type VoyantStorageName = "documents" | "media" | (string & {})

/** Resolves a logical store without exposing vendor buckets or bindings. */
export interface StorageProviderResolver {
  resolve(name: VoyantStorageName): StorageProvider | null
}
