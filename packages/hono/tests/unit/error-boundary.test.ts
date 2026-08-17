import { ToolError } from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { handleApiError } from "../../src/middleware/error-boundary.js"
import { isApiHttpError, RequestValidationError } from "../../src/validation.js"

/**
 * The pre-brand `RequestValidationError`, transcribed from published
 * `@voyant-travel/hono@0.128.1` `dist/validation.js`. Declaring the fields (not
 * just assigning them) is what makes `status`/`code`/`details` own properties
 * even when undefined — the invariant the fallback matches on.
 */
class PreBrandApiHttpError extends Error {
  status: number
  code?: string
  details?: Record<string, unknown>

  constructor(
    message: string,
    options: { status: number; code?: string; details?: Record<string, unknown> },
  ) {
    super(message)
    this.name = "ApiHttpError"
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

class PreBrandRequestValidationError extends PreBrandApiHttpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 400, code: "invalid_request", details })
    this.name = "RequestValidationError"
  }
}

describe("handleApiError", () => {
  it("does not reflect generic thrown status messages or details", async () => {
    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw Object.assign(new Error("database hostname leaked"), {
        status: 400,
        details: { secret: "x" },
      })
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; details?: unknown }

    expect(response.status).toBe(500)
    expect(body.error).toBe("Internal Server Error")
    expect(body.details).toBeUndefined()
  })

  it("still reflects framework validation errors", async () => {
    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw new RequestValidationError("Invalid input", { fields: { name: ["Required"] } })
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; details?: unknown }

    expect(response.status).toBe(400)
    expect(body.error).toBe("Invalid input")
    expect(body.details).toEqual({ fields: { name: ["Required"] } })
  })

  // The managed operator runtime inlines `@voyant-travel/hono` into its SSR
  // bundle while runtime-composed modules load their own copy from
  // `node_modules`. The query suffix reproduces that faithfully: Vite evaluates
  // the same source a second time, yielding classes that are structurally
  // identical but fail `instanceof` against the first copy. Before the brand,
  // this made every `.openapi()` validation failure a 500.
  it("reflects validation errors thrown by a duplicate module copy", async () => {
    const duplicate = await import("../../src/validation.js?duplicate-bundle")
    const error = new duplicate.RequestValidationError("Invalid input", {
      fields: { name: ["Required"] },
    })

    // Guard the premise: if this ever becomes true the test no longer covers
    // the cross-copy case and would pass for the wrong reason.
    expect(error instanceof RequestValidationError).toBe(false)

    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw error
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; code?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe("Invalid input")
    expect(body.code).toBe("invalid_request")
  })

  // The brand only helps once BOTH copies carry it. In a partly-upgraded graph
  // the boundary is new while the throwing module still pins a pre-brand
  // `@voyant-travel/hono`, which is the shape production actually runs.
  it("reflects an unbranded error from a pre-brand copy", async () => {
    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw new PreBrandRequestValidationError("dateLocal is required", { field: "dateLocal" })
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; code?: string; details?: unknown }

    expect(response.status).toBe(400)
    expect(body.error).toBe("dateLocal is required")
    expect(body.code).toBe("invalid_request")
    expect(body.details).toEqual({ field: "dateLocal" })
  })

  // `handleApiError` reflects an accepted error's message and details, so a
  // loose predicate leaks internals rather than merely mis-statusing. Each of
  // these satisfies part of the pre-brand shape and must still be rejected.
  it.each([
    [
      "a generic error carrying a status",
      () => Object.assign(new Error("database hostname leaked"), { status: 400, code: "nope" }),
    ],
    [
      "a generic error wearing a familiar name",
      () =>
        Object.assign(new Error("database hostname leaked"), {
          name: "RequestValidationError",
          status: 400,
        }),
    ],
  ])("hides %s", async (_label, make) => {
    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw make()
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; details?: unknown }

    expect(response.status).toBe(500)
    expect(body.error).toBe("Internal Server Error")
    expect(body.details).toBeUndefined()
  })

  // Hono rethrows non-Error values rather than routing them to `onError`, so a
  // bare object never reaches the boundary — assert the predicate directly.
  it("does not accept a bare object wearing the full pre-brand field set", () => {
    expect(
      isApiHttpError({
        name: "RequestValidationError",
        status: 400,
        code: "invalid_request",
        details: undefined,
        message: "database hostname leaked",
      }),
    ).toBe(false)

    expect(isApiHttpError(new PreBrandRequestValidationError("real"))).toBe(true)
    expect(isApiHttpError(new RequestValidationError("real"))).toBe(true)
  })

  // voyant#4805. A `ToolError` is a domain's typed refusal, not a crash. The
  // boundary did not recognise it, so a rejected booking-session commit
  // answered `500 {"error":"Internal Server Error"}` and the message naming the
  // violated pricing rule never left the process.
  it.each([
    ["INVALID_INPUT", 400, "invalid_request"],
    ["AUTHORIZATION_DENIED", 403, "authorization_denied"],
    ["NOT_FOUND", 404, "not_found"],
    ["APPROVAL_REQUIRED", 409, "approval_required"],
    ["CONFIRMATION_REQUIRED", 409, "confirmation_required"],
  ] as const)("answers a %s ToolError with %i", async (code, status, responseCode) => {
    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw new ToolError("The pricing is invalid: itemLines: no active price rule.", code, {
        outcome: { status: "invalid_pricing" },
      })
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as {
      error: string
      code?: string
      details?: Record<string, unknown>
    }

    expect(response.status).toBe(status)
    expect(body.code).toBe(responseCode)
    expect(body.error).toBe("The pricing is invalid: itemLines: no active price rule.")
    expect(body.details?.toolErrorCode).toBe(code)
    expect(body.details?.retryable).toBe(false)
    // `meta` carries the raw domain outcome — ids, balances, the rejected
    // command — and belongs in the log, not the response body.
    expect(JSON.stringify(body)).not.toContain("outcome")
  })

  // A deployment wired wrong is not something the caller can fix by changing
  // the request, and its message describes internals. Those codes must keep the
  // opaque 500 the boundary has always given them.
  it.each([
    "MISSING_SERVICE",
    "ACTION_POLICY_REQUIRED",
    "INVALID_OUTPUT",
    "PROVIDER_ERROR",
  ] as const)("keeps a %s ToolError an opaque 500", async (code) => {
    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw new ToolError("database hostname leaked", code)
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; details?: unknown }

    expect(response.status).toBe(500)
    expect(body.error).toBe("Internal Server Error")
    expect(body.details).toBeUndefined()
  })

  // The managed runtime inlines `@voyant-travel/tools` into the SSR bundle
  // while runtime-composed modules resolve their own, so the ToolError reaching
  // the boundary is virtually never an instance of the class this file loaded.
  // Matching by `instanceof` would fix nothing in production. Both shapes below
  // are what a second copy actually presents: the brand resolves through the
  // global symbol registry, and a copy published before the brand identifies
  // itself by `name` plus a string `code`.
  it.each([
    [
      "a branded copy",
      () => {
        const error = new Error("The pricing is invalid: a.1: why")
        error.name = "ToolError"
        return Object.assign(error, {
          code: "INVALID_INPUT",
          retryable: false,
          [Symbol.for("@voyant-travel/tools.ToolError")]: true,
        })
      },
    ],
    [
      "a pre-brand copy",
      () => {
        const error = new Error("The pricing is invalid: a.1: why")
        error.name = "ToolError"
        return Object.assign(error, { code: "INVALID_INPUT" })
      },
    ],
  ])("answers a ToolError thrown by %s", async (_label, make) => {
    const error = make()

    // Guard the premise: an `instanceof` match would pass for the wrong reason.
    expect(error instanceof ToolError).toBe(false)

    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw error
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; code?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe("The pricing is invalid: a.1: why")
    expect(body.code).toBe("invalid_request")
  })

  it("reflects a ZodError thrown by a duplicate zod copy", async () => {
    // A cross-copy ZodError is a real ZodError instance — it just fails
    // `instanceof` here — so match it on the `issues` array it always carries.
    const app = new Hono()
    app.onError(handleApiError)
    app.get("/bad", () => {
      throw Object.assign(new Error("crossed"), {
        name: "ZodError",
        issues: [{ code: "invalid_type", path: ["dateLocal"], message: "Required" }],
      })
    })

    const response = await app.request("/bad")
    const body = (await response.json()) as { error: string; code?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe("Required")
    expect(body.code).toBe("invalid_request")
  })
})
