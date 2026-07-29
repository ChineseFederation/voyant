import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { requireAuth } from "../../src/middleware/auth.js"
import type { VoyantBindings } from "../../src/types.js"

const TEST_ENV = { DATABASE_URL: "postgres://localhost/test" } as VoyantBindings

function mockExecutionCtx() {
  return { waitUntil: () => {}, passThroughOnException: () => {} }
}

function appWithAuth() {
  const app = new Hono()
  app.use(
    "*",
    requireAuth(() => ({}) as never),
  )
  return app
}

describe("MCP connector challenge", () => {
  it("answers an anonymous MCP request with the resource-metadata challenge", async () => {
    const app = appWithAuth()
    app.post("/v1/admin/mcp", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("https://ops.example.com/v1/admin/mcp", { method: "POST" }),
      TEST_ENV,
      mockExecutionCtx(),
    )

    // This header IS the discovery entry point: a chat assistant dials the
    // pasted URL with no credential and follows `resource_metadata` from here
    // to the authorization server. Without it the handshake cannot start.
    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="https://ops.example.com/.well-known/oauth-protected-resource"',
    )
  })

  it("challenges nested MCP paths such as the discovery manifest", async () => {
    const app = appWithAuth()
    app.get("/v1/admin/mcp/manifest", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("https://ops.example.com/v1/admin/mcp/manifest"),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata=")
  })

  it("leaves other admin routes with a plain 401", async () => {
    const app = appWithAuth()
    app.get("/v1/admin/bookings", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("https://ops.example.com/v1/admin/bookings"),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toBeNull()
  })
})
