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

/**
 * Minimal usage store. Hand-rolled rather than imported so this test asserts the
 * host actually records something, not that a particular store implementation
 * works — that is covered where the store lives.
 */
function recordingStore() {
  const hits: { key: string; at: string }[] = []
  return {
    hits,
    store: {
      record(key: string, at: Date) {
        hits.push({ key, at: at.toISOString() })
      },
      snapshot: () => [],
    },
  }
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

describe("serveAdminHost compatibility redirects", () => {
  it("redirects a superseded deep link and counts the hit before the app ever sees it", async () => {
    const clientAssetsDir = createAssetsDir()
    const { hits, store } = recordingStore()
    let appCalls = 0
    const web = serveAdminHost({
      clientAssetsDir,
      legacyPathUsage: store,
      app: () => {
        appCalls += 1
        return new Response("SSR NOT-FOUND", { status: 404 })
      },
    })

    const response = await web.request("/availability/slots/avsl_1?tab=manifest", {}, {}, ctx)

    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe("/operations/availability/avsl_1?tab=manifest")
    expect(hits).toEqual([{ key: "availability.slot", at: hits[0]?.at }])
    // The SSR handler would have rendered a not-found page for this bookmark.
    expect(appCalls).toBe(0)
  })

  it("leaves the canonical successor alone", async () => {
    const clientAssetsDir = createAssetsDir()
    const { hits, store } = recordingStore()
    const web = serveAdminHost({
      clientAssetsDir,
      legacyPathUsage: store,
      app: () => new Response("APP", { status: 200 }),
    })

    const response = await web.request("/operations/availability/avsl_1", {}, {}, ctx)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("APP")
    expect(hits).toEqual([])
  })

  it("does not intercept the API surface", async () => {
    const clientAssetsDir = createAssetsDir()
    const { hits, store } = recordingStore()
    const web = serveAdminHost({
      clientAssetsDir,
      legacyPathUsage: store,
      app: () => Response.json({ ok: true }),
    })

    const response = await web.request("/api/v1/admin/products/prod_9", {}, {}, ctx)

    expect(response.status).toBe(200)
    expect(hits).toEqual([])
  })
})
