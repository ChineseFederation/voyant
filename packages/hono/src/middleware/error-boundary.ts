import { apiErrorSchema } from "@voyant-travel/types"
import type { Context, MiddlewareHandler } from "hono"

import { tryGetExecutionCtx } from "../lib/execution-ctx.js"
import {
  type ErrorEvent,
  noopReporter,
  type Reporter,
  safeCaptureException,
} from "../observability/reporter.js"
import { runWithRequestId } from "../observability/request-context.js"
import { normalizeValidationError } from "../validation.js"

function generateRequestId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Mints (or honors a trusted inbound) `x-request-id`, exposes it on the
 * `X-Request-Id` response header and the `requestId` context variable, and runs
 * the rest of the request inside the async-context store so `getRequestId()`
 * works anywhere downstream (RFC #1553, primitive 1).
 */
export const requestId: MiddlewareHandler<{ Variables: { requestId?: string } }> = async (
  c,
  next,
) => {
  const existing = c.req.header("x-request-id")
  const id = existing?.trim() || generateRequestId()
  c.set("requestId", id)
  c.res.headers.set("X-Request-Id", id)
  await runWithRequestId(id, next)
}

export interface HandleApiErrorOptions {
  /**
   * Observability sink for unhandled 5xx exceptions (RFC #1553, primitive 2).
   * Defaults to {@link noopReporter}.
   */
  reporter?: Reporter
  /** Logical app name stamped on emitted {@link ErrorEvent}s. Defaults to `"voyant"`. */
  appName?: string
}

/**
 * Forwards a normalized {@link ErrorEvent} to the reporter. Best-effort: never
 * throws, and flushes an async reporter via `waitUntil` so capture doesn't
 * block the response. Exported so non-`onError` catch points (e.g. the
 * forwarded auth sub-app, which returns its own Response and never reaches the
 * outer `onError`) can emit through the same path.
 */
export function reportException(reporter: Reporter, c: Context, event: ErrorEvent): void {
  const ctx = tryGetExecutionCtx(c)
  safeCaptureException(reporter, event, ctx ? (promise) => ctx.waitUntil(promise) : undefined)
}

const LOGGED_HEADERS = new Set([
  "accept",
  "cf-connecting-ip",
  "cf-ray",
  "content-length",
  "content-type",
  "origin",
  "referer",
  "user-agent",
  "x-forwarded-for",
  "x-request-id",
])

export function handleApiError(
  err: unknown,
  c: Context,
  options: HandleApiErrorOptions = {},
): Response {
  const id = c.res.headers.get("X-Request-Id") || generateRequestId()
  const apiError = normalizeValidationError(err)
  const errRecord = err instanceof Object ? (err as Record<string, unknown>) : {}
  const code = apiError?.code
  const status = apiError?.status ?? 500
  const details =
    apiError?.details ??
    (apiError && errRecord.details && typeof errRecord.details === "object"
      ? (errRecord.details as Record<string, unknown>)
      : undefined)
  const errorMessage = apiError ? apiError.message : "Internal Server Error"

  try {
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      if (LOGGED_HEADERS.has(lowerKey)) headers[lowerKey] = value
    })

    console.error("[API:error]", {
      id,
      status,
      code,
      path: c.req.path,
      method: c.req.method,
      headers,
      err: err instanceof Error ? err.message : String(err),
      cause: err instanceof Error && err.cause ? String(err.cause) : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    })
  } catch {
    /* ignore logging errors */
  }

  const statusCode = status >= 100 && status <= 599 ? status : 500

  // Emit to the observability sink only for genuine server faults — handled
  // 4xx (validation/auth) are expected and would be noise (RFC #1553).
  if (statusCode >= 500) {
    reportException(options.reporter ?? noopReporter, c, {
      requestId: id,
      app: options.appName ?? "voyant",
      error: err,
      context: { path: c.req.path, method: c.req.method, status: statusCode, code },
    })
  }

  return new Response(
    JSON.stringify(apiErrorSchema.parse({ error: errorMessage, code, requestId: id, details })),
    {
      status: statusCode,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
        vary: "Cookie, Authorization",
        // Carry the correlation id on the error response too — `onError`
        // replaces `c.res`, which would otherwise drop the header set by the
        // `requestId` middleware (RFC #1553).
        "x-request-id": id,
      },
    },
  )
}

export const errorBoundary: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (err: unknown) {
    return handleApiError(err, c)
  }
}
