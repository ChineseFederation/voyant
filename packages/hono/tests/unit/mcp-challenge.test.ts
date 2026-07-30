import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { requireAuth } from "../../src/middleware/auth.js"
import type { VoyantBindings } from "../../src/types.js"

const TEST_ENV = { DATABASE_URL: "postgres://localhost/test" } as VoyantBindings

function envWith(overrides: Partial<VoyantBindings>): VoyantBindings {
  return { ...TEST_ENV, ...overrides }
}

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

async function challenge(request: Request, env: VoyantBindings): Promise<string | null> {
  const app = appWithAuth()
  app.all("/v1/admin/mcp", (c) => c.json({ ok: true }))
  const response = await app.fetch(request, env, mockExecutionCtx())
  expect(response.status).toBe(401)
  return response.headers.get("WWW-Authenticate")
}

describe("MCP connector challenge", () => {
  it("answers an anonymous MCP request with the resource-metadata challenge", async () => {
    // This header IS the discovery entry point: a chat assistant dials the
    // pasted URL with no credential and follows `resource_metadata` from here
    // to the authorization server. Without it the handshake cannot start.
    expect(
      await challenge(
        new Request("https://ops.example.com/v1/admin/mcp", { method: "POST" }),
        envWith({ API_BASE_URL: "https://ops.example.com/api" }),
      ),
    ).toBe(
      'Bearer resource_metadata="https://ops.example.com/.well-known/oauth-protected-resource"',
    )
  })

  it("names the configured public origin, not the origin a proxy rewrote Host to", async () => {
    // Managed deployments sit behind an edge that terminates TLS and re-points
    // `Host` at the upstream service. A request-derived challenge would send the
    // client to the internal address, where it cannot reach discovery at all.
    expect(
      await challenge(
        new Request("http://operator-abc123-europe-west1.a.run.app/v1/admin/mcp", {
          method: "POST",
        }),
        envWith({ API_BASE_URL: "https://ops.example.com/api" }),
      ),
    ).toBe(
      'Bearer resource_metadata="https://ops.example.com/.well-known/oauth-protected-resource"',
    )
  })

  it("falls back through APP_URL, DASH_BASE_URL and the CORS allowlist", async () => {
    const internal = () =>
      new Request("http://operator-abc123.internal/v1/admin/mcp", { method: "POST" })
    const expected = (origin: string) =>
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`

    expect(await challenge(internal(), envWith({ APP_URL: "https://app.example.com" }))).toBe(
      expected("https://app.example.com"),
    )
    expect(
      await challenge(internal(), envWith({ DASH_BASE_URL: "https://dash.example.com" })),
    ).toBe(expected("https://dash.example.com"))
    expect(
      await challenge(
        internal(),
        envWith({ CORS_ALLOWLIST: "https://first.example.com,https://second.example.com" }),
      ),
    ).toBe(expected("https://first.example.com"))
  })

  it("skips malformed configuration in favour of the next candidate", async () => {
    expect(
      await challenge(
        new Request("http://operator-abc123.internal/v1/admin/mcp", { method: "POST" }),
        envWith({ API_BASE_URL: "not-a-url", APP_URL: "https://app.example.com" }),
      ),
    ).toBe(
      'Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource"',
    )
  })

  it("falls back to the request origin when no public address is configured", async () => {
    // Local development configures nothing; the request is then the only signal.
    expect(
      await challenge(
        new Request("http://localhost:5173/v1/admin/mcp", { method: "POST" }),
        TEST_ENV,
      ),
    ).toBe('Bearer resource_metadata="http://localhost:5173/.well-known/oauth-protected-resource"')
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
