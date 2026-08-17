import { isToolError, type ToolErrorCode } from "@voyant-travel/tools"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { ZodError, type ZodType } from "zod"

import { DEFAULT_REQUEST_BODY_LIMIT_BYTES } from "./middleware/body-size.js"

/**
 * Cross-realm brand for {@link ApiHttpError}.
 *
 * `instanceof` compares class identity, which only holds when thrower and
 * catcher loaded the SAME module instance. The managed operator runtime breaks
 * that assumption: `ssr.noExternal: [/^@voyant-travel\//]` inlines a copy of
 * this file into the SSR bundle, while modules composed at runtime resolve
 * their own copy from `node_modules`. Two `ApiHttpError` classes then exist,
 * `instanceof` is false across them, and `normalizeValidationError` returns
 * `undefined` — so every validation failure surfaced as a bare
 * `500 Internal Server Error` instead of the `400 invalid_request` contract
 * (an empty POST body to any `.openapi()` route reproduced it).
 *
 * `Symbol.for` resolves through the global symbol registry, which IS shared
 * across module copies in the same realm, so the brand matches regardless of
 * how many times this file was bundled.
 */
const API_HTTP_ERROR_BRAND = Symbol.for("voyant.hono.ApiHttpError")

export class ApiHttpError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    options: {
      status: number
      code?: string
      details?: Record<string, unknown>
    },
  ) {
    super(message)
    this.name = "ApiHttpError"
    this.status = options.status
    this.code = options.code
    this.details = options.details
    // Non-enumerable so the brand never leaks into a serialized error body.
    Object.defineProperty(this, API_HTTP_ERROR_BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    })
  }
}

/**
 * Identifies an {@link ApiHttpError} across module copies. Prefer this over
 * `error instanceof ApiHttpError` anywhere the error may have been thrown by a
 * different bundle of `@voyant-travel/hono` — notably any framework-wide error
 * boundary. Subclasses inherit the brand through `super()`.
 */
export function isApiHttpError(error: unknown): error is ApiHttpError {
  if (typeof error === "object" && error !== null) {
    const candidate = error as Record<PropertyKey, unknown>
    if (candidate[API_HTTP_ERROR_BRAND] === true) return true
    return isPreBrandApiHttpError(candidate)
  }
  return false
}

const LEGACY_API_HTTP_ERROR_NAMES = new Set([
  "ApiHttpError",
  "RequestValidationError",
  "UnauthorizedApiError",
  "ForbiddenApiError",
])

/**
 * Recognise an `ApiHttpError` thrown by a copy published before the brand.
 *
 * A partly-upgraded graph is the normal case, not an edge case: the error
 * boundary resolves the newest `@voyant-travel/hono` while ~30 module packages
 * still pin exact older versions until each is re-released. Without this the
 * brand fixes nothing in production.
 *
 * The check reconstructs the *full* invariant of the pre-brand class rather
 * than a couple of convenient fields, because `handleApiError` reflects an
 * accepted error's `message` and `details` to the client — a loose predicate is
 * a confidentiality hole, not just a wrong status.
 *
 * A genuine instance satisfies all four, verified against published 0.128.x:
 * it is a real `Error` (`Error` is a realm intrinsic, so `instanceof` holds
 * across module copies); its `name` is one of exactly four classes, all
 * declared in this file; its `status` is numeric; and the constructor assigns
 * `status`, `code` and `details` unconditionally, so all three are own
 * properties even when the value is `undefined`.
 *
 * Notably this rejects `Object.assign(new Error(...), { status: 400 })` and any
 * bare object literal wearing a familiar `name`.
 */
function isPreBrandApiHttpError(candidate: Record<PropertyKey, unknown>): boolean {
  return (
    candidate instanceof Error &&
    typeof candidate.name === "string" &&
    LEGACY_API_HTTP_ERROR_NAMES.has(candidate.name) &&
    typeof candidate.status === "number" &&
    Object.hasOwn(candidate, "status") &&
    Object.hasOwn(candidate, "code") &&
    Object.hasOwn(candidate, "details")
  )
}

/**
 * `ZodError` and `HTTPException` reach the boundary from whichever copy the
 * throwing module loaded, so they need the same treatment. Neither class is
 * ours to brand, so match on the shape each one is uniquely identified by:
 * a `ZodError` always carries an `issues` array, and an `HTTPException` always
 * pairs a numeric `status` with a `getResponse()` method (it does not set
 * `name`, so that is not a usable discriminator).
 */
function isZodError(error: unknown): error is ZodError {
  if (error instanceof ZodError) return true
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Error).name === "ZodError" &&
    Array.isArray((error as ZodError).issues)
  )
}

/**
 * The client-answerable {@link ToolErrorCode}s, and the status each one is.
 *
 * A `ToolError` is the tool layer's *typed* refusal, and the domain services
 * behind a route throw it directly — so one reaching this boundary is usually a
 * decision, not a crash. Until voyant#4805 the boundary did not recognise it at
 * all: every code fell through to the generic arm and answered
 * `500 {"error":"Internal Server Error"}`, which tells the caller the product
 * is broken when the input was merely rejected, and drops the message that says
 * why. Observed on
 * `POST /v1/admin/catalog/booking-sessions/:sessionId/commit`, where a pricing
 * refusal read as a server fault and left an operator with no way — from the
 * product, the API, or the logs — to see which rule had been violated.
 *
 * The table is here rather than in `@voyant-travel/tools` because HTTP is this
 * package's vocabulary; `tools` owns the code union and stays
 * transport-neutral.
 *
 * Deliberately partial, and a missing code is not an oversight. The five it
 * omits — `MISSING_SERVICE`, `ACTION_POLICY_REQUIRED`, `INVALID_OUTPUT`,
 * `PROVIDER_ERROR`, `PROVIDER_UNAVAILABLE` — report a deployment wired wrong, a
 * server-side defect, or an upstream fault. None of them is answerable by
 * changing the request, and each one's message describes internals, so they keep
 * today's behaviour unchanged: the opaque 500 that reflects nothing and still
 * reaches the observability sink. `handleApiError` must never mirror an internal
 * message back on a server fault.
 */
const TOOL_ERROR_HTTP_STATUS: Partial<Record<ToolErrorCode, number>> = {
  INVALID_INPUT: 400,
  AUTHORIZATION_DENIED: 403,
  NOT_FOUND: 404,
  APPROVAL_REQUIRED: 409,
  CONFIRMATION_REQUIRED: 409,
}

/**
 * Error-body `code` for a `ToolError`. A 400 keeps `invalid_request`, the code
 * the framework's own validation failures already carry, so a caller matching
 * on it does not have to learn a second spelling for the same answer.
 */
function toolErrorResponseCode(code: ToolErrorCode, status: number): string {
  return status === 400 ? "invalid_request" : code.toLowerCase()
}

function isHttpException(error: unknown): error is HTTPException {
  if (error instanceof HTTPException) return true
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as HTTPException).status === "number" &&
    typeof (error as HTTPException).getResponse === "function"
  )
}

export class RequestValidationError extends ApiHttpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      status: 400,
      code: "invalid_request",
      details,
    })
    this.name = "RequestValidationError"
  }
}

export class UnauthorizedApiError extends ApiHttpError {
  constructor(message = "Unauthorized") {
    super(message, {
      status: 401,
      code: "unauthorized",
    })
    this.name = "UnauthorizedApiError"
  }
}

export class ForbiddenApiError extends ApiHttpError {
  constructor(message = "Forbidden") {
    super(message, {
      status: 403,
      code: "forbidden",
    })
    this.name = "ForbiddenApiError"
  }
}

function toValidationError(
  error: ZodError,
  fallbackMessage = "Invalid request",
): RequestValidationError {
  return new RequestValidationError(error.issues[0]?.message ?? fallbackMessage, {
    issues: error.issues,
    // `isZodError` admits a cross-copy instance, which still carries `flatten`;
    // the guard only covers a shape-compatible object that does not.
    fields: typeof error.flatten === "function" ? error.flatten() : undefined,
  })
}

function validate<T>(schema: ZodType<T>, input: unknown, fallbackMessage?: string): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw toValidationError(parsed.error, fallbackMessage)
  }

  return parsed.data
}

export async function parseJsonBody<T>(
  c: Context,
  schema: ZodType<T>,
  options?: { invalidJsonMessage?: string; invalidBodyMessage?: string; maxBytes?: number },
): Promise<T> {
  let input: unknown

  const text = await readBoundedRequestText(c, options?.maxBytes)
  try {
    input = JSON.parse(text)
  } catch {
    throw new RequestValidationError(options?.invalidJsonMessage ?? "Invalid JSON body")
  }

  return validate(schema, input, options?.invalidBodyMessage)
}

export async function parseOptionalJsonBody<T>(
  c: Context,
  schema: ZodType<T>,
  options?: {
    defaultValue?: unknown
    invalidBodyMessage?: string
    maxBytes?: number
  },
): Promise<T> {
  let input: unknown

  const text = await readBoundedRequestText(c, options?.maxBytes)
  if (text.length === 0) {
    return validate(schema, options?.defaultValue ?? {}, options?.invalidBodyMessage)
  }
  try {
    input = JSON.parse(text)
  } catch {
    input = options?.defaultValue ?? {}
  }

  return validate(schema, input, options?.invalidBodyMessage)
}

async function readBoundedRequestText(c: Context, maxBytes = DEFAULT_REQUEST_BODY_LIMIT_BYTES) {
  const contentLength = c.req.header("content-length")
  if (contentLength) {
    const size = Number(contentLength)
    if (Number.isFinite(size) && size > maxBytes) {
      throw new RequestValidationError("Request body too large", { maxBytes })
    }
  }

  const text = await c.req.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestValidationError("Request body too large", { maxBytes })
  }
  return text
}

export function parseQuery<T>(
  c: Context,
  schema: ZodType<T>,
  options?: { invalidQueryMessage?: string },
): T {
  return validate(
    schema,
    Object.fromEntries(new URL(c.req.url).searchParams),
    options?.invalidQueryMessage ?? "Invalid query parameters",
  )
}

/**
 * Translates a client-answerable {@link ToolErrorCode} onto the framework error
 * contract, or returns `undefined` so the caller keeps its existing handling.
 *
 * `isToolError` rather than `instanceof`: the managed runtime inlines a copy of
 * every `@voyant-travel/*` package into the SSR bundle while runtime-composed
 * modules resolve their own from `node_modules`, so the error almost never
 * comes from the class this file's copy would compare against — the same
 * cross-copy trap `API_HTTP_ERROR_BRAND` exists for.
 *
 * `meta` is not reflected. It carries the raw domain outcome — ids, balances,
 * the whole rejected command — which belongs in the server log, not in the
 * response body. The message and `nextSteps` are written to be read by the
 * caller and are the actionable part.
 */
function toolErrorToApiHttpError(error: unknown): ApiHttpError | undefined {
  if (!isToolError(error)) return undefined
  const status = TOOL_ERROR_HTTP_STATUS[error.code]
  if (status === undefined) return undefined
  return new ApiHttpError(error.message, {
    status,
    code: toolErrorResponseCode(error.code, status),
    details: {
      toolErrorCode: error.code,
      retryable: error.retryable,
      ...(error.nextSteps?.length ? { nextSteps: error.nextSteps } : {}),
    },
  })
}

export function normalizeValidationError(error: unknown): ApiHttpError | undefined {
  if (isApiHttpError(error)) {
    return error
  }

  if (isZodError(error)) {
    return toValidationError(error)
  }

  const toolError = toolErrorToApiHttpError(error)
  if (toolError) return toolError

  if (isHttpException(error)) {
    // Hono's request validators throw HTTPException before our validation hook
    // runs — most notably HTTPException(400, "Malformed JSON in request body")
    // from the JSON body parser on `.openapi()` routes. Map it onto the
    // framework error contract so bad client input is a structured 4xx, not a
    // 500 (voyant#2114).
    return new ApiHttpError(error.message, {
      status: error.status,
      code: error.status === 400 ? "invalid_request" : undefined,
    })
  }

  return undefined
}
