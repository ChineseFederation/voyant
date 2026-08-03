import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  publicResponseCache,
  resetPublicCacheStateForTests,
} from "../../src/middleware/public-cache.js"

/** Minimal in-memory KVStore (the env.CACHE binding shape). */
function fakeKv() {
  const store = new Map<string, { value: string; ttl?: number }>()
  return {
    store,
    get: vi.fn(async <T = string>(key: string, options?: { type?: "json" | "text" }) => {
      const entry = store.get(key)
      if (!entry) return null
      return (options?.type === "json" ? JSON.parse(entry.value) : entry.value) as T | null
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, { value, ttl: options?.expirationTtl })
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

interface TestBindings {
  DATABASE_URL: string
  CACHE?: ReturnType<typeof fakeKv>
}

function testEnv(env: TestBindings): Record<string, unknown> {
  return env as Record<string, unknown>
}

function buildApp(kv: ReturnType<typeof fakeKv> | undefined, handler: () => Response) {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use("*", publicResponseCache())
  app.get("/v1/public/products", handler)
  app.get("/v1/admin/products", handler)
  const env = { DATABASE_URL: "postgres://localhost/test", CACHE: kv }
  return {
    request: (path: string, init?: RequestInit) => app.request(path, init, testEnv(env)),
  }
}

afterEach(() => {
  resetPublicCacheStateForTests()
})

describe("publicResponseCache (KV fallback — no Cache API in the test runtime)", () => {
  it("caches a public+s-maxage response and serves the second request from cache", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ items: [1] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }),
    )
    const app = buildApp(kv, handler)

    const first = await app.request("/v1/public/products")
    expect(first.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)

    const second = await app.request("/v1/public/products")
    expect(second.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(second.headers.get("x-voyant-cache")).toBe("hit")
    expect(await second.json()).toEqual({ items: [1] })
  })

  it("never caches responses without an explicit public + s-maxage marking", async () => {
    const kv = fakeKv()
    const handler = vi.fn(() => new Response("{}", { status: 200 }))
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    await app.request("/v1/public/products")

    expect(handler).toHaveBeenCalledTimes(2)
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("never caches private or no-store responses", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "private, max-age=60" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("never caches responses carrying Set-Cookie", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: {
            "cache-control": "public, s-maxage=60",
            "set-cookie": "sid=1",
          },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("ignores non-public-surface paths", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/admin/products")
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("ignores non-GET requests", async () => {
    const kv = fakeKv()
    const app = new Hono<{ Bindings: never }>()
    app.use("*", publicResponseCache())
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60" },
        }),
    )
    app.post("/v1/public/search", handler)
    const env = { DATABASE_URL: "x", CACHE: kv }

    await app.request("/v1/public/search", { method: "POST" }, testEnv(env))
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("request Cache-Control: no-cache bypasses the cached copy", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    await app.request("/v1/public/products", { headers: { "cache-control": "no-cache" } })

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it("clamps KV expirationTtl to the 60s KV minimum", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=30" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")

    expect(kv.put).toHaveBeenCalledOnce()
    const options = kv.put.mock.calls[0]?.[2]
    expect(options?.expirationTtl).toBe(60)
  })

  it("strips per-request and CORS headers from the stored copy", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: {
            "cache-control": "public, s-maxage=60",
            "x-request-id": "req_abc",
            "access-control-allow-origin": "https://a.example",
            "content-type": "application/json",
          },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    const hit = await app.request("/v1/public/products")

    expect(hit.headers.get("x-voyant-cache")).toBe("hit")
    expect(hit.headers.get("x-request-id")).toBeNull()
    expect(hit.headers.get("access-control-allow-origin")).toBeNull()
    expect(hit.headers.get("content-type")).toBe("application/json")
  })

  it("does not share an entry between two storefront keys on the same URL", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      (c: { req: { header(name: string): string | undefined } }) =>
        new Response(JSON.stringify({ channel: c.req.header("x-api-key") }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, s-maxage=60",
          },
        }),
    )
    const app = new Hono<{ Bindings: TestBindings }>()
    app.use("*", publicResponseCache())
    app.get("/v1/public/products", (c) => handler(c))
    const env = { DATABASE_URL: "postgres://localhost/test", CACHE: kv }

    const website = await app.request(
      "/v1/public/products",
      { headers: { "x-api-key": "pk_website" } },
      testEnv(env),
    )
    const b2b = await app.request(
      "/v1/public/products",
      { headers: { "x-api-key": "pk_b2b" } },
      testEnv(env),
    )

    expect(await website.json()).toEqual({ channel: "pk_website" })
    expect(await b2b.json()).toEqual({ channel: "pk_b2b" })
    expect(handler).toHaveBeenCalledTimes(2)
    expect(b2b.headers.get("x-voyant-cache")).toBeNull()
    expect(kv.store.size).toBe(2)

    // ...and each key still serves its own entry on a repeat request.
    const websiteAgain = await app.request(
      "/v1/public/products",
      { headers: { "x-api-key": "pk_website" } },
      testEnv(env),
    )
    expect(websiteAgain.headers.get("x-voyant-cache")).toBe("hit")
    expect(await websiteAgain.json()).toEqual({ channel: "pk_website" })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it("never embeds the presented storefront key in the cache key", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products", { headers: { "x-api-key": "pk_secret_value" } })

    expect(kv.put).toHaveBeenCalledOnce()
    expect(kv.put.mock.calls[0]?.[0]).not.toContain("pk_secret_value")
  })

  it("never caches a response declaring a Vary the key does not model", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: {
            "cache-control": "public, s-maxage=60",
            vary: "accept-language",
          },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("caches a response whose Vary names only key contributors", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: {
            "cache-control": "public, s-maxage=60",
            vary: "X-Api-Key",
          },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    expect(kv.put).toHaveBeenCalledOnce()
  })

  it("never caches a response declaring Vary: *", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60", vary: "*" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("neither reads nor writes the shared cache for a credentialed request", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60" },
        }),
    )
    const app = buildApp(kv, handler)

    // Populate from an anonymous request first, so a read would have hit.
    await app.request("/v1/public/products")
    expect(kv.put).toHaveBeenCalledOnce()

    const authed = await app.request("/v1/public/products", {
      headers: { authorization: "Bearer token" },
    })

    expect(handler).toHaveBeenCalledTimes(2)
    expect(authed.headers.get("x-voyant-cache")).toBeNull()
    expect(kv.put).toHaveBeenCalledOnce()
  })

  it("performs no cache read or write work outside the KV store on the hit path", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    kv.get.mockClear()
    await app.request("/v1/public/products")

    // One lookup, no second round trip to resolve the variant.
    expect(kv.get).toHaveBeenCalledOnce()
  })

  it("is a transparent no-op when neither Cache API nor KV is available", async () => {
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60" },
        }),
    )
    const app = buildApp(undefined, handler)

    const first = await app.request("/v1/public/products")
    const second = await app.request("/v1/public/products")

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
