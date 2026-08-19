import type { ClientOptions } from "openapi-fetch"

const PUBLIC_API_PATH = "/v1/public"

/** A Fetch-compatible transport accepted by `createPublicApiClient`. */
export type PublicApiFetch = NonNullable<ClientOptions["fetch"]>

export interface ManagedPublicApiFetchOptions {
  /**
   * The exact origin serving the managed same-origin Public API proxy.
   *
   * Pass the current request origin during SSR, or `window.location.origin` in
   * a browser. HTTP is accepted for local development; hosted deployments
   * should use HTTPS.
   */
  proxyOrigin: string | URL
  /** Fetch implementation used to dispatch the rewritten request. */
  fetch?: PublicApiFetch
}

export class ManagedPublicApiFetchConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ManagedPublicApiFetchConfigurationError"
  }
}

function parseProxyOrigin(value: string | URL): string {
  if (typeof value === "string" && value !== value.trim()) {
    throw new ManagedPublicApiFetchConfigurationError(
      "proxyOrigin must be an absolute HTTP(S) origin.",
    )
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ManagedPublicApiFetchConfigurationError(
      "proxyOrigin must be an absolute HTTP(S) origin.",
    )
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ManagedPublicApiFetchConfigurationError(
      "proxyOrigin must be an absolute HTTP(S) origin.",
    )
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new ManagedPublicApiFetchConfigurationError(
      "proxyOrigin must contain only an origin, without credentials, a path, query, or fragment.",
    )
  }

  return url.origin
}

function isPublicApiPath(pathname: string): boolean {
  return pathname === PUBLIC_API_PATH || pathname.startsWith(`${PUBLIC_API_PATH}/`)
}

/**
 * Creates the Fetch seam used by Voyant-managed Sites.
 *
 * `createPublicApiClient` still owns generated operation types and credential
 * validation. This transport changes only where an already-constructed Public
 * API request is dispatched: its origin becomes the managed Site origin while
 * its canonical `/v1/public` path, query, method, headers, body, streaming, and
 * abort behavior are preserved.
 */
export function createManagedPublicApiFetch(options: ManagedPublicApiFetchOptions): PublicApiFetch {
  const proxyOrigin = parseProxyOrigin(options.proxyOrigin)
  const fetchImpl = options.fetch ?? globalThis.fetch

  if (typeof fetchImpl !== "function") {
    throw new ManagedPublicApiFetchConfigurationError(
      "A Fetch implementation is required in this runtime.",
    )
  }

  return async (request) => {
    const sourceUrl = new URL(request.url)
    if (!isPublicApiPath(sourceUrl.pathname)) {
      throw new ManagedPublicApiFetchConfigurationError(
        `Managed Public API Fetch only accepts ${PUBLIC_API_PATH} requests.`,
      )
    }

    const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, proxyOrigin)
    return fetchImpl(new Request(targetUrl, request))
  }
}
