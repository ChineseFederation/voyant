import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { ExecutionContext } from "hono"
import { describe, expect, it } from "vitest"

import { serveAdminHost } from "../src/serve.js"

function createAssetsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "admin-host-"))
  mkdirSync(join(dir, "assets"), { recursive: true })
  writeFileSync(join(dir, "assets", "x.txt"), "hello")
  return dir
}

/** Minimal execution context, mirroring how the Node host supplies one. */
const ctx: ExecutionContext = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
  props: undefined,
}

describe("serveAdminHost", () => {
  it("serves built client assets", async () => {
    const clientAssetsDir = createAssetsDir()
    const web = serveAdminHost({
      clientAssetsDir,
      app: () => new Response("APP", { status: 200 }),
    })

    const response = await web.request("/assets/x.txt")

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("hello")
  })

  it("falls through to the app for non-asset routes", async () => {
    const clientAssetsDir = createAssetsDir()
    const web = serveAdminHost({
      clientAssetsDir,
      app: () =>
        new Response("<script>window.__HYDRATED__ = true</script>", {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
        }),
    })

    const response = await web.request("/anything-else", {}, {}, ctx)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("window.__HYDRATED__")
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self' 'unsafe-inline' https://connect-js.stripe.com https://js.stripe.com",
    )
  })

  it("relaxes headers only for real admin document responses", async () => {
    const clientAssetsDir = createAssetsDir()
    const web = serveAdminHost({
      clientAssetsDir,
      app: (request) =>
        new URL(request.url).pathname.startsWith("/api")
          ? Response.json({ ok: true })
          : new Response("<html><body>ADMIN</body></html>", {
              headers: {
                "content-type": "text/html; charset=UTF-8",
                "content-security-policy":
                  "default-src 'self'; script-src 'self' 'sha256-ssr-bootstrap'; style-src 'self' 'unsafe-inline'",
              },
            }),
    })

    const [documentResponse, apiResponse, assetResponse] = await Promise.all([
      web.request("/settings/payments", {}, {}, ctx),
      web.request("/api/status", {}, {}, ctx),
      web.request("/assets/x.txt", {}, {}, ctx),
    ])

    expect(documentResponse.headers.get("cross-origin-opener-policy")).toBe("unsafe-none")
    expect(documentResponse.headers.get("content-security-policy")).toContain(
      "frame-src https://connect-js.stripe.com https://js.stripe.com",
    )
    expect(documentResponse.headers.get("content-security-policy")).toContain(
      "script-src 'self' 'sha256-ssr-bootstrap' https://connect-js.stripe.com https://js.stripe.com",
    )
    expect(documentResponse.headers.get("content-security-policy")).toContain(
      "style-src 'self' 'unsafe-inline'",
    )

    for (const response of [apiResponse, assetResponse]) {
      expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin")
      expect(response.headers.get("content-security-policy")).not.toContain("stripe.com")
    }
  })
})
