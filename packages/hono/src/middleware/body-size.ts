import type { Context, MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"

export interface RequestBodyLimitOptions {
  /** Outer ceiling applied to non-JSON bodies (e.g. multipart uploads). */
  maxBytes: number
  /**
   * Tighter cap applied when the request `Content-Type` is `application/json`.
   * When omitted, the outer `maxBytes` ceiling applies to JSON bodies too.
   */
  jsonMaxBytes?: number
}

// Mirrors Hono's own `jsonRegex` (hono/dist/validator/validator.js) and the
// openApiValidationHook content-type guard EXACTLY — case-sensitive, strict
// params — so "this matches" ⟺ "Hono parses the body as JSON". Keep in sync.
const JSON_CONTENT_TYPE = /^application\/([a-z-.]+\+)?json(;\s*[a-zA-Z0-9-]+=([^;]+))*$/

export const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 10 * 1024 * 1024

/**
 * App-wide OUTER ceiling for the global `requestBodyLimit` mount. It must be at
 * least the largest body any legitimate route accepts so the global stream cap
 * never rejects valid traffic — the media upload route allows a 25 MiB file in a
 * multipart envelope (`MAX_MULTIPART_UPLOAD_BYTES` = 25 MiB + 1 MiB in
 * `@voyant-travel/storage`). Finer limits stay per-route: `parseJsonBody`/
 * `readBoundedRequestText` keep the tighter `DEFAULT_REQUEST_BODY_LIMIT_BYTES`
 * (10 MiB) for JSON, and the upload route enforces its own 25 MiB cap. Raising
 * the global guard to a header-only check would reopen the no-Content-Length
 * hole; lowering it below this would reject valid uploads (voyant#2114).
 */
export const MAX_GLOBAL_REQUEST_BODY_BYTES = 26 * 1024 * 1024

export function requestBodyLimit(options: RequestBodyLimitOptions): MiddlewareHandler {
  // Hono's bodyLimit checks the Content-Length header AND wraps the request body
  // stream so it throws once the actual read exceeds maxSize. That stream cap is
  // what bounds chunked / HTTP/2 requests with no Content-Length header — the
  // case the previous header-only check could not catch (e.g. `.openapi()` json
  // routes that read via c.req.json() and never went through parseJsonBody).
  const enforceDefault = bodyLimit({
    maxSize: options.maxBytes,
    onError: (c) => tooLargeResponse(c, options.maxBytes),
  })
  // JSON bodies keep the tighter cap that `parseJsonBody` historically enforced
  // (10 MiB) so migrated `.openapi()` routes aren't loosened to the upload
  // ceiling. Non-JSON bodies (uploads) get the outer `maxBytes`. (voyant#2114)
  // Clamp to `maxBytes` so the JSON cap is never LOOSER than the outer ceiling —
  // a deployment that tightens `maxBytes` below the JSON default (e.g. a 1 MiB
  // global override) must also tighten JSON, not silently leave it at 10 MiB.
  const jsonMaxBytes =
    options.jsonMaxBytes != null ? Math.min(options.jsonMaxBytes, options.maxBytes) : null
  const enforceJson =
    jsonMaxBytes != null
      ? bodyLimit({
          maxSize: jsonMaxBytes,
          onError: (c) => tooLargeResponse(c, jsonMaxBytes),
        })
      : null

  return async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") {
      return next()
    }

    const contentType = c.req.header("content-type")
    if (enforceJson && contentType && JSON_CONTENT_TYPE.test(contentType)) {
      return enforceJson(c, next)
    }

    return enforceDefault(c, next)
  }
}

function tooLargeResponse(c: Context, maxBytes: number): Response {
  const requestId = c.get("requestId" as never) as string | undefined
  return c.json(
    {
      error: "Request body too large",
      code: "request_body_too_large",
      maxBytes,
      requestId,
    },
    413,
  )
}

/**
 * A hard byte ceiling for a JSON route, applied by reading the body once.
 *
 * `requestBodyLimit` above is the app-wide guard. This is the per-route form for
 * surfaces that accept an unauthenticated body and want a far tighter cap than
 * the global one — public shopping and trip selection both cap at 64 KiB.
 *
 * It reads the stream itself rather than delegating to Hono's `bodyLimit`
 * because it then seeds `c.req.bodyCache.text` with the bounded buffer. OpenAPI
 * validation reads through `HonoRequest.json()`, whose first cache key is
 * `text`; without the seed the validator re-reads a stream this middleware has
 * already consumed. Hono's runtime body cache stores promises even though its
 * public type describes the resolved values, hence the cast.
 *
 * Shared rather than copied: two packages mount it, and the cache-seeding is
 * pinned to Hono internals, so a second copy would drift silently the next time
 * those change.
 */
export function boundedJsonBody(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const declaredLength = Number(c.req.header("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return tooLargeResponse(c, maxBytes)
    }

    const body = c.req.raw.body
    if (!body) return next()
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let bytesRead = 0
    let text = ""
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytesRead += chunk.value.byteLength
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => {})
        return tooLargeResponse(c, maxBytes)
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()

    c.req.bodyCache.text = Promise.resolve(text) as unknown as string
    return next()
  }
}
