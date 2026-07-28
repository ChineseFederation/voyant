import type { StorageObject, StorageProvider, StorageUploadBody, UploadOptions } from "../types.js"

/**
 * Options for {@link createGatewayStorageProvider}.
 */
export interface GatewayStorageProviderOptions {
  /** Base URL of the storage gateway (for example `"https://gw.example.com"`). */
  endpoint: string
  /**
   * Opaque bearer credential sent as `Authorization: Bearer ${token}` on every
   * request. The provider does not parse or interpret the token; the gateway is
   * responsible for validating it and resolving the caller's storage scope.
   */
  token: string
  /** `fetch` implementation to use. Defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Provider name (defaults to `"gateway"`). */
  name?: string
  /**
   * Tier segment prepended to every object key on the wire (for example
   * `"media"` or `"documents"`). The gateway derives the target bucket from the
   * first key segment, so a per-store provider must pin its tier here. The
   * prefix is transparent to callers: keys passed in and returned by this
   * provider are always the un-prefixed, caller-facing keys.
   */
  tier?: string
  /**
   * Public CDN base that fronts this store's object namespace, if the
   * deployment has one. The base must be the origin **plus** whatever path
   * prefix the gateway serves this store under, so that
   * `${publicBaseUrl}/${key}` resolves for a caller-facing key.
   *
   * Supplying it lets {@link StorageProvider.publicUrl} derive delivery URLs on
   * every read from a single configured value, so no absolute origin is ever
   * persisted (voyant#3845). When absent `publicUrl` returns `null`, meaning
   * "this store has no public origin" — correct for a private tier such as
   * documents, but a media store feeding a storefront must set it, which is why
   * the graph provider requires it there.
   */
  publicBaseUrl?: string
}

async function opaqueBackendIdentity(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Build a storage provider that talks to an HTTP storage gateway.
 *
 * The gateway exposes a small object API under `/v1/objects` and authenticates
 * each request with a bearer token. This keeps raw bucket credentials out of the
 * caller: the gateway holds the credentials and enforces the token's scope,
 * while this provider only speaks the HTTP contract. It is deliberately generic
 * and carries no knowledge of any particular deployment or vendor.
 */
export function createGatewayStorageProvider(
  options: GatewayStorageProviderOptions,
): StorageProvider {
  const endpoint = options.endpoint.replace(/\/+$/, "")
  const doFetch = options.fetch ?? globalThis.fetch
  const name = options.name ?? "gateway"
  const tier = options.tier?.replace(/^\/+|\/+$/g, "") || ""
  const publicBaseUrl = options.publicBaseUrl?.trim().replace(/\/+$/, "") || ""

  /** Prepend the pinned tier so the gateway routes to the right bucket. */
  function wireKey(key: string): string {
    return tier ? `${tier}/${key}` : key
  }

  function objectUrl(key: string): string {
    return `${endpoint}/v1/objects/${encodeKey(wireKey(key))}`
  }

  function authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { authorization: `Bearer ${options.token}`, ...extra }
  }

  return {
    name,
    resolveBackendIdentity: () =>
      opaqueBackendIdentity(`gateway:${endpoint}:${tier || "default"}:${options.token}`),
    publicUrl(key) {
      return publicBaseUrl ? `${publicBaseUrl}/${encodeKey(key)}` : null
    },
    async upload(
      body: StorageUploadBody,
      uploadOptions: UploadOptions = {},
    ): Promise<StorageObject> {
      const key = uploadOptions.key ?? generateKey()
      const headers = authHeaders({
        "content-type": uploadOptions.contentType ?? "application/octet-stream",
      })
      if (uploadOptions.metadata !== undefined) {
        headers["x-voyant-metadata"] = JSON.stringify(uploadOptions.metadata)
      }
      const response = await doFetch(objectUrl(key), {
        method: "PUT",
        headers,
        body: await toBytes(body),
      })
      await assertOk(response, "upload")
      const payload = (await response.json()) as { key: string; url: string }
      // Return the caller-facing (un-prefixed) key, not the gateway's
      // tier-prefixed echo — otherwise a later get/delete would double-prefix.
      return { key, url: payload.url }
    },
    async delete(key) {
      const response = await doFetch(objectUrl(key), {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (response.status === 404) return
      await assertOk(response, "delete")
    },
    async signedUrl(key, expiresIn) {
      const response = await doFetch(`${objectUrl(key)}/signed-url`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ expiresIn }),
      })
      await assertOk(response, "signedUrl")
      const payload = (await response.json()) as { url: string }
      return payload.url
    },
    async get(key) {
      const response = await doFetch(objectUrl(key), {
        method: "GET",
        headers: authHeaders(),
      })
      if (response.status === 404) return null
      await assertOk(response, "get")
      return response.arrayBuffer()
    },
  }
}

async function assertOk(response: Response, operation: string): Promise<void> {
  if (response.ok) return
  if (response.status === 401) {
    throw new Error(`Storage gateway rejected the bearer token (401) during ${operation}`)
  }
  const snippet = (await safeBodyText(response)).slice(0, 256)
  throw new Error(
    `Storage gateway ${operation} failed with status ${response.status}${
      snippet ? `: ${snippet}` : ""
    }`,
  )
}

async function safeBodyText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim()
  } catch {
    return ""
  }
}

function generateKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

async function toBytes(body: StorageUploadBody): Promise<Uint8Array<ArrayBuffer>> {
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (body instanceof Uint8Array) {
    // Copy into a fresh ArrayBuffer-backed view so the value is a valid `BodyInit`.
    const copy = new Uint8Array(body.byteLength)
    copy.set(body)
    return copy
  }
  return new Uint8Array(await body.arrayBuffer())
}
