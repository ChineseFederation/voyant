/**
 * Conditional-request support for the staff surface (voyant#4754).
 *
 * Admin reads were leaving cache policy unstated. Edge caching is already
 * bypassed for cookie-bearing requests, so nothing shared was at risk — but a
 * response with no directives is also not reusable by the *browser*, so every
 * repeat navigation and every reload re-downloaded a body the client already
 * had, byte for byte.
 *
 * ## Why `no-cache` and not `max-age`
 *
 * `no-cache` means "store it, but ask before reusing it": the browser keeps the
 * payload and revalidates with `If-None-Match`, so a repeat read costs one
 * round trip and a 304 with no body instead of a full re-transfer. `max-age`
 * would skip the round trip too, but at the price of a window in which a staff
 * member sees a record they have already changed — which is why the few admin
 * routes that opt into one (`private, max-age=30` on dashboard aggregates) do
 * it deliberately, per route. A route that sets its own `Cache-Control` is left
 * alone here, so that opt-in keeps working.
 *
 * ## What this stores, and where — a decision, not a side effect
 *
 * Revalidation requires storage: there is no `Cache-Control` that yields a 304
 * without the browser having kept the body. So this changes admin JSON from
 * "most browsers store nothing" (no directives, no validators) to "stored in
 * the operator's own profile cache". `private` keeps it off every shared cache,
 * but it does mean booking and customer payloads persist on the device after
 * sign-out — the browser cache is not session-scoped, and signing out does not
 * evict it.
 *
 * That is judged acceptable for a staff workstation, where the same profile
 * already holds the admin bundle and the session cookie, and it is bounded: the
 * entries are `private`, revalidated before every reuse, and evicted under
 * ordinary disk-cache pressure. A deployment that cannot accept device-resident
 * admin payloads turns it off with `adminRevalidation: false`, and gets the
 * previous behaviour back — no directives, no storage, full re-transfer per
 * navigation. See `docs/architecture/caching-architecture.md` §13.
 *
 * ## Bounding the buffer
 *
 * An `ETag` is a hash of the body, so the body has to be read. The read is
 * incremental and stops at `maxBodyBytes`: past that the buffered chunks are
 * stitched back in front of the unread remainder and the response continues
 * unstamped, so a large or genuinely streamed body is neither held in memory
 * whole nor collapsed into one. Only JSON is eligible at all — the staff
 * surface also serves document and file downloads, which keep their streaming
 * behaviour untouched.
 */
import type { MiddlewareHandler } from "hono"

import { sha256Hex } from "../auth/crypto.js"
import type { VoyantBindings } from "../types.js"

/** Store the body, but never reuse it without asking the origin first. */
export const ADMIN_REVALIDATE_CACHE_CONTROL = "private, no-cache"

/**
 * A member's admin response is scoped by their session, so a stored entry may
 * only be reused for the same credential.
 */
const ADMIN_VARY_HEADERS = ["Cookie", "Authorization"] as const

export interface AdminRevalidationOptions {
  /**
   * Response media types eligible for an ETag. Matched against the media type
   * of `Content-Type`, ignoring parameters. Defaults to JSON only.
   */
  contentTypes?: readonly string[]
  /**
   * Stop reading — and leave the response unstamped — once this many bytes have
   * been buffered. This is the middleware's memory ceiling per in-flight
   * request, and the point past which a streamed body is left streaming.
   * Default 1 MiB, which is far above any admin page payload and far below
   * anything worth delaying the first byte for.
   */
  maxBodyBytes?: number
}

const DEFAULT_CONTENT_TYPES = ["application/json"] as const
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

function mediaType(contentType: string | null): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
}

/**
 * `If-None-Match` is a list, and `W/"x"` and `"x"` are the same entity under
 * the weak comparison a GET revalidation uses. Compare on the opaque tag.
 */
function opaqueTag(value: string): string {
  const trimmed = value.trim()
  const withoutWeak = trimmed.startsWith("W/") ? trimmed.slice(2) : trimmed
  return withoutWeak.replace(/^"|"$/g, "")
}

function matchesIfNoneMatch(header: string, etag: string): boolean {
  if (header.trim() === "*") return true
  const wanted = opaqueTag(etag)
  return header.split(",").some((candidate) => opaqueTag(candidate) === wanted)
}

function appendVary(headers: Headers): void {
  const existing = headers.get("Vary")
  if (existing?.trim() === "*") return
  const present = new Set(
    (existing ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
  const missing = ADMIN_VARY_HEADERS.filter((value) => !present.has(value.toLowerCase()))
  if (missing.length === 0) return
  headers.set("Vary", existing ? `${existing}, ${missing.join(", ")}` : missing.join(", "))
}

/**
 * A view over its own `ArrayBuffer` — the narrower form `BodyInit` accepts. A
 * chunk off a stream reader is only `ArrayBufferLike` and cannot be sent as-is.
 */
type BodyBytes = Uint8Array<ArrayBuffer>

function concat(chunks: readonly Uint8Array[], size: number): BodyBytes {
  const body = new Uint8Array(new ArrayBuffer(size))
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/**
 * Put the already-read chunks back in front of whatever the reader has left, so
 * an over-cap body is passed on without ever having been held whole.
 */
function restitch(
  chunks: readonly Uint8Array[],
  reader: ReadableStreamDefaultReader<Uint8Array>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

interface BoundedBody {
  /** The whole body, or `null` when it exceeded the cap. */
  bytes: BodyBytes | null
  /** The body to send on, equivalent to the one that was read. */
  stream: BodyInit
}

async function readBounded(
  body: ReadableStream<Uint8Array>,
  maxBodyBytes: number,
): Promise<BoundedBody> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    if (size > maxBodyBytes) {
      return { bytes: null, stream: restitch(chunks, reader) }
    }
  }

  const bytes = concat(chunks, size)
  return { bytes, stream: bytes }
}

/**
 * Stamp safe, successful JSON reads with `Cache-Control` + `ETag`, and answer
 * a matching `If-None-Match` with 304.
 *
 * Mount it on the staff surface (`/v1/admin/*`). It wraps the handler, so the
 * origin still does the work on a revalidation — what a 304 saves is the
 * payload, not the query. Skipping the round trip as well is a per-route
 * `max-age` decision, deliberately not made here.
 */
export function adminResponseRevalidation<TBindings extends VoyantBindings = VoyantBindings>(
  options: AdminRevalidationOptions = {},
): MiddlewareHandler<{ Bindings: TBindings }> {
  const contentTypes = new Set<string>(options.contentTypes ?? DEFAULT_CONTENT_TYPES)
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  return async (c, next) => {
    const method = c.req.method
    if (method !== "GET" && method !== "HEAD") return next()

    await next()

    const response = c.res
    if (response.status !== 200) return
    // A route that stated its own policy owns it — including the deliberate
    // `private, max-age=30` aggregates and anything marked `no-store`.
    if (response.headers.has("Cache-Control")) return
    if (!contentTypes.has(mediaType(response.headers.get("Content-Type")))) return
    const body = response.body
    if (!body) return

    // Read once rather than `clone()`ing: a clone tees the stream, so both
    // branches hold the payload and the origin carries it twice.
    const bounded = await readBounded(body, maxBodyBytes)
    const contentType = response.headers.get("Content-Type")

    // `c.res =` copies the PREVIOUS response's headers onto the replacement
    // (Hono's `set res`, skipping `Content-Type`), so stamp the old headers
    // first and let the copy carry them across.
    if (bounded.bytes === null) {
      c.res = new Response(bounded.stream, {
        status: response.status,
        statusText: response.statusText,
        ...(contentType ? { headers: { "content-type": contentType } } : {}),
      })
      return
    }

    const digest = await sha256Hex(bounded.bytes)
    const etag = `W/"${digest.slice(0, 32)}"`
    response.headers.set("ETag", etag)
    response.headers.set("Cache-Control", ADMIN_REVALIDATE_CACHE_CONTROL)
    appendVary(response.headers)

    const ifNoneMatch = c.req.header("if-none-match")
    if (ifNoneMatch && matchesIfNoneMatch(ifNoneMatch, etag)) {
      // RFC 9110 §15.4.5: a 304 carries no body, and keeps the validators and
      // cache directives so the stored entry is refreshed.
      response.headers.delete("Content-Length")
      c.res = new Response(null, { status: 304 })
      return
    }

    c.res = new Response(bounded.stream, {
      status: response.status,
      statusText: response.statusText,
      ...(contentType ? { headers: { "content-type": contentType } } : {}),
    })
  }
}
