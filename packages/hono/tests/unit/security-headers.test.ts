import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { securityHeaders } from "../../src/middleware/security-headers.js"

describe("securityHeaders middleware", () => {
  it("sets default hardening headers", async () => {
    const app = new Hono()
    app.use("*", securityHeaders())
    app.get("/ok", (c) => c.json({ ok: true }))

    const response = await app.request("https://api.example/ok")

    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin")
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    expect(response.headers.get("content-security-policy")).not.toContain("stripe.com")
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000")
  })

  it("scopes Stripe Connect CSP and popup compatibility to configured admin paths", async () => {
    const app = new Hono()
    app.use(
      "*",
      securityHeaders({
        stripeConnect: { pathPrefixes: ["/admin/settings/payments"] },
      }),
    )
    app.get("*", (c) => c.json({ ok: true }))

    const [stripeResponse, strictResponse, lookalikeResponse] = await Promise.all([
      app.request("https://admin.example/admin/settings/payments/connect"),
      app.request("https://admin.example/admin/settings/profile"),
      app.request("https://admin.example/admin/settings/payments-lookalike"),
    ])

    expect(stripeResponse.headers.get("cross-origin-opener-policy")).toBe("unsafe-none")
    expect(stripeResponse.headers.get("cross-origin-opener-policy")).not.toBe(
      "same-origin-allow-popups",
    )
    expect(stripeResponse.headers.get("content-security-policy")).toContain(
      "frame-src https://connect-js.stripe.com https://js.stripe.com",
    )
    expect(stripeResponse.headers.get("content-security-policy")).toContain(
      "img-src 'self' data: blob: https://*.stripe.com",
    )
    expect(stripeResponse.headers.get("content-security-policy")).toContain(
      "script-src 'self' https://connect-js.stripe.com https://js.stripe.com",
    )
    expect(stripeResponse.headers.get("content-security-policy")).toContain(
      "style-src 'self' 'unsafe-inline'",
    )
    expect(stripeResponse.headers.get("content-security-policy")).not.toContain(
      "'unsafe-inline' 'sha256-0hAheEzaMe6uXIKV4EehS9pu1am1lj/KnnzrOYqckXk='",
    )

    for (const response of [strictResponse, lookalikeResponse]) {
      expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin")
      expect(response.headers.get("content-security-policy")).not.toContain("stripe.com")
    }
  })

  it("extends a custom CSP without duplicating Stripe sources", async () => {
    const app = new Hono()
    app.use(
      "*",
      securityHeaders({
        contentSecurityPolicy:
          "default-src 'none'; frame-src https://connect-js.stripe.com; img-src 'self'",
        stripeConnect: { pathPrefixes: ["/payments"] },
      }),
    )
    app.get("/payments", (c) => c.text("ok"))

    const response = await app.request("https://admin.example/payments")
    const csp = response.headers.get("content-security-policy") ?? ""

    expect(csp.match(/https:\/\/connect-js\.stripe\.com/g)).toHaveLength(2)
    expect(csp).toContain("frame-src https://connect-js.stripe.com https://js.stripe.com")
    expect(csp).toContain("img-src 'self' https://*.stripe.com")
    expect(csp).toContain("style-src 'sha256-0hAheEzaMe6uXIKV4EehS9pu1am1lj/KnnzrOYqckXk='")
  })

  it("can restrict Stripe relaxation to document responses for SPA hosts", async () => {
    const app = new Hono()
    app.use(
      "*",
      securityHeaders({
        stripeConnect: { pathPrefixes: ["/"], documentResponsesOnly: true },
      }),
    )
    app.get("/settings/payments", (c) => c.html("<main>Payments</main>"))
    app.get("/api/status", (c) => c.json({ ok: true }))

    const [documentResponse, apiResponse] = await Promise.all([
      app.request("https://admin.example/settings/payments"),
      app.request("https://admin.example/api/status"),
    ])

    expect(documentResponse.headers.get("cross-origin-opener-policy")).toBe("unsafe-none")
    expect(documentResponse.headers.get("content-security-policy")).toContain("stripe.com")
    expect(apiResponse.headers.get("cross-origin-opener-policy")).toBe("same-origin")
    expect(apiResponse.headers.get("content-security-policy")).not.toContain("stripe.com")
  })

  it("preserves downstream SSR hashes while extending the Stripe document policy", async () => {
    const app = new Hono()
    app.use(
      "*",
      securityHeaders({
        preserveResponseContentSecurityPolicy: true,
        stripeConnect: { pathPrefixes: ["/"], documentResponsesOnly: true },
      }),
    )
    app.get("/", (c) => {
      c.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'sha256-ssr-bootstrap'; style-src 'self' 'unsafe-inline'",
      )
      return c.html("<main>SSR</main>")
    })

    const response = await app.request("https://admin.example/")
    const csp = response.headers.get("content-security-policy") ?? ""

    expect(csp).toContain("script-src 'self' 'sha256-ssr-bootstrap'")
    expect(csp).toContain("https://connect-js.stripe.com")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain(
      "'unsafe-inline' 'sha256-0hAheEzaMe6uXIKV4EehS9pu1am1lj/KnnzrOYqckXk='",
    )
  })
})
