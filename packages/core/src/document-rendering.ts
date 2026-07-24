import type { DocumentRenderer } from "./document-rendering-runtime-port.js"

export type {
  DocumentRenderer,
  PdfPageFormat,
  PdfRenderRequest,
} from "./document-rendering-runtime-port.js"
export { documentRendererPort } from "./document-rendering-runtime-port.js"

export interface HttpDocumentRendererOptions {
  endpoint: string
  name?: string
  backendIdentity?: string
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
  fetch?: typeof fetch
}

async function opaqueBackendIdentity(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Portable adapter for a self-hosted or managed Voyant-compatible render endpoint. */
export function createHttpDocumentRenderer(options: HttpDocumentRendererOptions): DocumentRenderer {
  const endpoint = options.endpoint.trim()
  if (!endpoint) throw new Error("HTTP document renderer endpoint is required.")
  const backendIdentity = options.backendIdentity?.trim()
  if ((options.headers !== undefined || options.fetch !== undefined) && !backendIdentity) {
    throw new Error(
      "HTTP document renderer backendIdentity is required when headers or a custom fetch implementation are supplied.",
    )
  }

  return {
    name: options.name?.trim() || "http-document-renderer",
    resolveBackendIdentity: () => opaqueBackendIdentity(backendIdentity || `http:${endpoint}`),
    async renderPdf(request) {
      const configuredHeaders =
        typeof options.headers === "function" ? await options.headers() : options.headers
      const headers = new Headers(configuredHeaders)
      headers.set("content-type", "application/json")
      headers.set("accept", "application/pdf")

      const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 500)
        throw new Error(
          `Document renderer failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        )
      }

      return new Uint8Array(await response.arrayBuffer())
    },
  }
}

export interface DocumentRendererEnvironment {
  VOYANT_DOCUMENT_RENDERER_URL?: unknown
  VOYANT_DOCUMENT_RENDERER_TOKEN?: unknown
  VOYANT_DOCUMENT_RENDERER_NAME?: unknown
  VOYANT_CLOUD_DEPLOYMENT_ID?: unknown
}

export interface HttpDocumentRendererFromEnvFetchOptions {
  fetch: typeof fetch
  backendIdentity: string
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Resolve the zero-code HTTP renderer seam shared by managed and self-hosted deployments. */
export function createHttpDocumentRendererFromEnv(
  env: DocumentRendererEnvironment,
  options?: HttpDocumentRendererFromEnvFetchOptions,
): DocumentRenderer | null {
  const endpoint = nonEmptyString(env.VOYANT_DOCUMENT_RENDERER_URL)
  if (!endpoint) return null
  const customBackendIdentity = options ? nonEmptyString(options.backendIdentity) : undefined
  if (options && !customBackendIdentity) {
    throw new Error(
      "HTTP document renderer backendIdentity is required when a custom fetch implementation is supplied.",
    )
  }

  const token = nonEmptyString(env.VOYANT_DOCUMENT_RENDERER_TOKEN)
  const deploymentId = nonEmptyString(env.VOYANT_CLOUD_DEPLOYMENT_ID)
  return createHttpDocumentRenderer({
    endpoint,
    name: nonEmptyString(env.VOYANT_DOCUMENT_RENDERER_NAME),
    backendIdentity:
      customBackendIdentity ??
      (deploymentId
        ? `http:${endpoint}:deployment:${deploymentId}`
        : `http:${endpoint}:credential:${token ?? "anonymous"}`),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(deploymentId ? { "x-voyant-deployment-id": deploymentId } : {}),
    },
    ...(options ? { fetch: options.fetch } : {}),
  })
}
