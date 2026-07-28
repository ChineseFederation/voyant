import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"

import { handleApiError, requestId } from "../../src/middleware/error-boundary.js"
import { requirePermission } from "../../src/middleware/require-permission.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("requirePermission", () => {
  it("returns a structured 401 when the request has no user id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", requestId)
    app.use(
      "*",
      requirePermission(() => ({}) as never, "crm", "write", {
        auth: {
          hasPermission: vi.fn().mockResolvedValue(true),
        },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure"),
      {},
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: "Unauthorized",
      code: "unauthorized",
    })
  })

  it("returns a structured 403 when the permission check fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    const hasPermission = vi.fn().mockResolvedValue(false)

    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", requestId)
    app.use("*", async (c, next) => {
      c.set("userId", "user_123")
      c.set("actor", "staff")
      await next()
    })
    app.use(
      "*",
      requirePermission(() => ({}) as never, "crm", "write", {
        auth: {
          hasPermission,
        },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure"),
      {},
      mockExecutionCtx(),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: "Forbidden",
      code: "forbidden",
    })
    expect(hasPermission).toHaveBeenCalledTimes(1)
  })

  it("passes API token audit metadata to custom permission checkers", async () => {
    const hasPermission = vi.fn().mockResolvedValue(true)

    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("userId", "user_123")
      c.set("actor", "staff")
      c.set("callerType", "api_key")
      c.set("apiTokenId", "key_123")
      c.set("apiKeyId", "key_123")
      c.set("scopes", [])
      await next()
    })
    app.use(
      "*",
      requirePermission(() => ({}) as never, "crm", "write", {
        auth: { hasPermission },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure"),
      {},
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          apiTokenId: "key_123",
          apiKeyId: "key_123",
          scopes: [],
        }),
      }),
    )
  })

  it("allows internal requests only when scopes satisfy the permission", async () => {
    const hasPermission = vi.fn()

    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("callerType", "internal")
      c.set("isInternalRequest", true)
      c.set("actor", "staff")
      c.set("scopes", ["crm:write"])
      await next()
    })
    app.use(
      "*",
      requirePermission(() => ({}) as never, "crm", "write", {
        auth: { hasPermission },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure"),
      {},
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(hasPermission).not.toHaveBeenCalled()
  })

  it("does not let an asserted internal actor exceed the machine scope cap", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const hasPermission = vi.fn().mockResolvedValue(true)

    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", requestId)
    app.use("*", async (c, next) => {
      c.set("callerType", "internal")
      c.set("isInternalRequest", true)
      c.set("userId", "user_privileged")
      c.set("principalSubtype", "max")
      c.set("actor", "staff")
      c.set("scopes", ["crm:read"])
      await next()
    })
    app.use(
      "*",
      requirePermission(() => ({}) as never, "crm", "write", {
        auth: { hasPermission },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure"),
      {},
      mockExecutionCtx(),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: "Forbidden",
      code: "forbidden",
    })
    expect(hasPermission).not.toHaveBeenCalled()
  })

  it("returns 401 when userId is set but actor is not (upstream wiring bug)", async () => {
    // `requirePermission` runs after `requireActor`. If actor is missing here,
    // it means the auth pipeline silently let an unresolved request through —
    // throw rather than fabricate a default that would mask the bug. See #381.
    vi.spyOn(console, "error").mockImplementation(() => {})

    const hasPermission = vi.fn().mockResolvedValue(true)

    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", requestId)
    app.use("*", async (c, next) => {
      c.set("userId", "user_123")
      // intentionally no `actor`
      await next()
    })
    app.use(
      "*",
      requirePermission(() => ({}) as never, "crm", "write", {
        auth: { hasPermission },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure"),
      {},
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
    expect(hasPermission).not.toHaveBeenCalled()
  })
})

function mockExecutionCtx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
  }
}
