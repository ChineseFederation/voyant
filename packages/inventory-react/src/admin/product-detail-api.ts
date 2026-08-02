import { defaultFetcher, type VoyantFetcher } from "../client.js"
import type { ProductDetailApi } from "../components/product-detail/host.js"

/**
 * Build the {@link ProductDetailApi} REST transport from a plain
 * `baseUrl` + fetcher pair — the same client contract the rest of the
 * products data layer uses ({@link VoyantFetcher} from the shared provider
 * context on the client, the host runtime's cookie-forwarding fetcher in
 * SSR loaders). This replaces the app RPC client templates used to inject:
 * the product-detail page's section queries/mutations all speak plain REST
 * against the module's `/v1/...` surface.
 */
export interface ProductDetailApiClient {
  baseUrl: string
  fetcher?: VoyantFetcher
}

export class ProductDetailApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "ProductDetailApiError"
    this.status = status
    this.body = body
  }
}

export function createProductDetailRestApi(client: ProductDetailApiClient): ProductDetailApi {
  const fetcher = client.fetcher ?? defaultFetcher

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers()
    if (body !== undefined) headers.set("Content-Type", "application/json")

    const response = await fetcher(joinUrl(client.baseUrl, path), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

    const payload = await safeJson(response)
    if (!response.ok) {
      throw new ProductDetailApiError(errorMessage(response, payload), response.status, payload)
    }
    return payload as T
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    put: (path, body) => request("PUT", path, body),
    delete: (path) => request("DELETE", path),
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmed}${path.startsWith("/") ? path : `/${path}`}`
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function errorMessage(response: Response, body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const issueMessages =
      "issues" in body && Array.isArray(body.issues)
        ? body.issues.flatMap((issue) => {
            if (typeof issue !== "object" || issue === null || !("message" in issue)) return []
            const message = String(issue.message)
            const fix = "fix" in issue && typeof issue.fix === "string" ? issue.fix : null
            return [fix ? `${message} ${fix}` : message]
          })
        : []
    if (issueMessages.length > 0) return issueMessages.join("\n")

    if (!("error" in body)) return `Request failed: ${response.status} ${response.statusText}`
    const error = (body as { error: unknown }).error
    if (typeof error === "string") return error
    if (typeof error === "object" && error !== null && "message" in error) {
      return String((error as { message: unknown }).message)
    }
  }
  return `Request failed: ${response.status} ${response.statusText}`
}
