import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { handleApiError } from "../../src/middleware/error-boundary.js"
import { RequestValidationError } from "../../src/validation.js"

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
