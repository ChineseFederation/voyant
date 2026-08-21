import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { handleApiError, requestId } from "../../src/middleware/error-boundary.js"
import {
  installRequestPermissionAuthorizer,
  requireAdditionalPermission,
} from "../../src/middleware/request-permission.js"

const permission = { resource: "catalog", action: "booking-session-write" }

function app(options: {
  scopes?: string[]
  internal?: boolean
  hasPermission?: ReturnType<typeof vi.fn>
  install?: boolean
}) {
  const route = new Hono()
  route.onError(handleApiError)
  route.use("*", requestId)
  route.use("*", async (c, next) => {
    c.set("db", { marker: "request-db" })
    c.set("userId", "user_1")
    c.set("actor", "staff")
    c.set("callerType", "session")
    if (options.scopes) c.set("scopes", options.scopes)
    if (options.internal) c.set("isInternalRequest", true)
    return next()
  })
  if (options.install !== false) {
    route.use(
      "*",
      installRequestPermissionAuthorizer({ hasPermission: options.hasPermission as never }),
    )
  }
  route.get("/secure", async (c) => {
    await requireAdditionalPermission(c, permission)
    return c.json({ ok: true })
  })
  return route
}

describe("request-scoped additional permission authorizer", () => {
  it("accepts a matching credential scope without calling session RBAC", async () => {
    const hasPermission = vi.fn().mockResolvedValue(false)
    const response = await app({
      scopes: ["catalog:booking-session-write"],
      hasPermission,
    }).request("/secure")
    expect(response.status).toBe(200)
    expect(hasPermission).not.toHaveBeenCalled()
  })

  it("uses session RBAC with the already-acquired request database", async () => {
    const hasPermission = vi.fn().mockResolvedValue(true)
    const response = await app({ hasPermission }).request("/secure")
    expect(response.status).toBe(200)
    expect(hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        db: { marker: "request-db" },
        permission,
        auth: expect.objectContaining({ userId: "user_1", actor: "staff" }),
      }),
    )
  })

  it("does not let an internal credential fall back around its scope ceiling", async () => {
    const hasPermission = vi.fn().mockResolvedValue(true)
    const response = await app({ internal: true, scopes: [], hasPermission }).request("/secure")
    expect(response.status).toBe(403)
    expect(hasPermission).not.toHaveBeenCalled()
  })

  it("fails closed when the application did not install an authorizer", async () => {
    const response = await app({ install: false }).request("/secure")
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ code: "permission_authorizer_unavailable" })
  })
})
