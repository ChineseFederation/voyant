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
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<PropertyKey, unknown>)[API_HTTP_ERROR_BRAND] === true
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

export function normalizeValidationError(error: unknown): ApiHttpError | undefined {
  if (isApiHttpError(error)) {
    return error
  }

  if (isZodError(error)) {
    return toValidationError(error)
  }

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
