import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { cors } from "../../src/middleware/cors.js"
import type { VoyantBindings } from "../../src/types.js"

describe("cors middleware", () => {
  it("returns allowlist headers on preflight responses", async () => {
    const app = new Hono<{ Bindings: VoyantBindings }>()
    app.use("*", cors())
    app.get("/auth/me", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("https://api.example/auth/me", {
        method: "OPTIONS",
        headers: {
          origin: "https://dashboard.example",
          "access-control-request-method": "GET",
          "access-control-request-headers": "content-type",
        },
      }),
      {
        CORS_ALLOWLIST: "https://dashboard.example",
      },
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.example")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
    expect(response.headers.get("access-control-allow-methods")).toBe("GET")
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type")
    expect(response.headers.get("vary")).toBe("Origin")
  })

  it("does not allow credentialed bare wildcard origins", async () => {
    const app = new Hono<{ Bindings: VoyantBindings }>()
    app.use("*", cors())

    const response = await app.fetch(
      new Request("https://api.example/auth/me", {
        method: "OPTIONS",
        headers: {
          origin: "https://attacker.example",
          "access-control-request-method": "GET",
        },
      }),
      { CORS_ALLOWLIST: "*" },
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("keeps localhost origins exact", async () => {
    const app = new Hono<{ Bindings: VoyantBindings }>()
    app.use("*", cors())

    const response = await app.fetch(
      new Request("https://api.example/auth/me", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "GET",
        },
      }),
      { CORS_ALLOWLIST: "http://localhost:3000" },
    )

    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("filters requested preflight headers", async () => {
    const app = new Hono<{ Bindings: VoyantBindings }>()
    app.use("*", cors())

    const response = await app.fetch(
      new Request("https://api.example/auth/me", {
        method: "OPTIONS",
        headers: {
          origin: "https://dashboard.example",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type, cookie, x-voyant-checkout-capability",
        },
      }),
      { CORS_ALLOWLIST: "https://dashboard.example" },
    )

    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type, x-voyant-checkout-capability",
    )
  })

  it("advertises the public-origin header on preflight", async () => {
    const app = new Hono<{ Bindings: VoyantBindings }>()
    app.use("*", cors())

    const response = await app.fetch(
      new Request("https://api.example/auth/me", {
        method: "OPTIONS",
        headers: {
          origin: "https://dashboard.example",
          "access-control-request-method": "POST",
          "access-control-request-headers": "x-api-key, authorization, x-voyant-public-origin",
        },
      }),
      { CORS_ALLOWLIST: "https://dashboard.example" },
    )

    expect(response.headers.get("access-control-allow-headers")).toBe(
      "x-api-key, authorization, x-voyant-public-origin",
    )
  })
})

describe("cors middleware — per-key dynamic origin", () => {
  const ALLOWED = "https://shop.example.com"

  function dynamicApp() {
    const app = new Hono<{ Bindings: VoyantBindings }>()
    // Echo the request origin only when a "storefront" allows it, mirroring the
    // auth runtime's resolveCorsOrigin authorizer.
    app.use(
      "*",
      cors({
        resolveDynamicOrigin: (c) => {
          const origin = c.req.header("origin") ?? ""
          return origin === ALLOWED || origin === "https://preview.example.com" ? origin : null
        },
        isDynamicPath: (pathname) =>
          pathname === "/v1/public" || pathname.startsWith("/v1/public/"),
      }),
    )
    app.get("/v1/public/catalog", (c) => c.json({ ok: true }))
    app.get("/v1/admin/catalog", (c) => c.json({ ok: true }))
    return app
  }

  it("echoes an allowed storefront origin on a direct request (not in static allowlist)", async () => {
    const response = await dynamicApp().fetch(
      new Request("https://api.example/v1/public/catalog", { headers: { origin: ALLOWED } }),
      { CORS_ALLOWLIST: "https://dashboard.example" },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED)
    expect(response.headers.get("vary")).toBe("Origin")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
  })

  it("short-circuits an allowed-origin preflight with 204 + CORS headers", async () => {
    const response = await dynamicApp().fetch(
      new Request("https://api.example/v1/public/catalog", {
        method: "OPTIONS",
        headers: {
          origin: "https://preview.example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "x-api-key, authorization",
        },
      }),
      { CORS_ALLOWLIST: "" },
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("https://preview.example.com")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
    expect(response.headers.get("access-control-allow-headers")).toBe("x-api-key, authorization")
    expect(response.headers.get("vary")).toBe("Origin")
  })

  it("omits CORS headers for a disallowed origin", async () => {
    const response = await dynamicApp().fetch(
      new Request("https://api.example/v1/public/catalog", {
        headers: { origin: "https://evil.example" },
      }),
      { CORS_ALLOWLIST: "" },
    )

    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("does not apply dynamic CORS to non-customer (admin) surfaces", async () => {
    const response = await dynamicApp().fetch(
      new Request("https://api.example/v1/admin/catalog", { headers: { origin: ALLOWED } }),
      { CORS_ALLOWLIST: "https://dashboard.example" },
    )

    // The storefront origin is not in the static allowlist and admin is not a
    // dynamic surface, so no CORS headers are emitted.
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("still honors the static allowlist for customer surfaces when no storefront matches", async () => {
    const response = await dynamicApp().fetch(
      new Request("https://api.example/v1/public/catalog", {
        headers: { origin: "https://dashboard.example" },
      }),
      { CORS_ALLOWLIST: "https://dashboard.example" },
    )

    expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.example")
  })
})
