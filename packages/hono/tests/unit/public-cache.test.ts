import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

/** Cache writes are scheduled, not awaited — let them settle before asserting. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  resetPublicCacheStateForTests()
  vi.useRealTimers()
})

beforeEach(() => {
  // Freshness is evaluated against the wall clock, so the suite drives it.
  vi.useFakeTimers({ shouldAdvanceTime: true })
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
    await flush()
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
    await flush()
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
    await flush()
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
    await flush()
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
    await flush()
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

    await flush()
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
    await flush()
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

    await flush()
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
    await flush()
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
    await flush()
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
    await flush()
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
    await flush()
    expect(kv.put).toHaveBeenCalledOnce()

    const authed = await app.request("/v1/public/products", {
      headers: { authorization: "Bearer token" },
    })

    expect(handler).toHaveBeenCalledTimes(2)
    expect(authed.headers.get("x-voyant-cache")).toBeNull()
    await flush()
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

  it("serves a stale entry immediately and refreshes it in the background", async () => {
    const kv = fakeKv()
    let version = 1
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ version: version++ }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    await flush()
    expect(handler).toHaveBeenCalledTimes(1)

    // Past s-maxage, inside the stale-while-revalidate window.
    vi.setSystemTime(Date.now() + 61_000)

    // Two arrivals inside the stale window. One is elected to refresh; the
    // other is served the stored copy without waiting for it.
    let releaseRefresh: (() => void) | undefined
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    const slowHandler = vi.fn(async () => {
      await refreshGate
      return new Response(JSON.stringify({ version: version++ }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      })
    })
    const refreshingApp = buildApp(kv, slowHandler)

    const refresher = refreshingApp.request("/v1/public/products")
    const served = await refreshingApp.request("/v1/public/products")

    // Served while the refresh is still blocked on the gate.
    expect(served.headers.get("x-voyant-cache")).toBe("stale")
    expect(await served.json()).toEqual({ version: 1 })
    expect(slowHandler).toHaveBeenCalledTimes(1)

    releaseRefresh?.()
    const refreshed = await refresher
    expect(await refreshed.json()).toEqual({ version: 2 })

    await flush()
    const afterRefresh = await refreshingApp.request("/v1/public/products")
    expect(afterRefresh.headers.get("x-voyant-cache")).toBe("hit")
    expect(await afterRefresh.json()).toEqual({ version: 2 })
    expect(slowHandler).toHaveBeenCalledTimes(1)
  })

  it("treats an entry past s-maxage + stale-while-revalidate as a miss", async () => {
    const kv = fakeKv()
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=30" },
        }),
    )
    const app = buildApp(kv, handler)

    await app.request("/v1/public/products")
    await flush()

    vi.setSystemTime(Date.now() + 91_000)

    const miss = await app.request("/v1/public/products")
    expect(miss.headers.get("x-voyant-cache")).toBeNull()
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it("honours the declared s-maxage even though the backend TTL is floored at 60s", async () => {
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
    await flush()
    // The row lives 60s because the KV floor says so...
    expect(kv.put.mock.calls[0]?.[2]?.expirationTtl).toBe(60)

    // ...but the entry stops being fresh at the declared 30s, and with no
    // stale-while-revalidate declared it is not servable at all after that.
    vi.setSystemTime(Date.now() + 31_000)
    const after = await app.request("/v1/public/products")
    expect(after.headers.get("x-voyant-cache")).toBeNull()
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it("collapses concurrent misses on one key onto a single origin computation", async () => {
    const kv = fakeKv()
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const handler = vi.fn(async () => {
      await gate
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, s-maxage=60",
        },
      })
    })
    const app = buildApp(kv, handler)

    const all = Promise.all([
      app.request("/v1/public/products"),
      app.request("/v1/public/products"),
      app.request("/v1/public/products"),
    ])
    release?.()
    const responses = await all

    expect(handler).toHaveBeenCalledTimes(1)
    for (const response of responses) {
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
    }
  })

  it("elects a single revalidator through the backend when it can exclude", async () => {
    const kv = fakeKv()
    const putIfAbsent = vi.fn(async (key: string, value: string) => {
      if (kv.store.has(key)) return false
      kv.store.set(key, { value })
      return true
    })
    const kvWithElection = Object.assign(kv, { putIfAbsent })
    const handler = vi.fn(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
        }),
    )
    const app = buildApp(kvWithElection, handler)

    await app.request("/v1/public/products")
    await flush()
    vi.setSystemTime(Date.now() + 61_000)

    // Another process already holds the revalidation lease. This arrival must
    // lose the election, serve stale, and not touch the origin.
    const leaseKey = [...kv.store.keys()].find((name) => name.startsWith("respcache:"))
    kv.store.set(`${leaseKey}:revalidating`, { value: "1" })

    const served = await app.request("/v1/public/products")
    await flush()

    expect(served.headers.get("x-voyant-cache")).toBe("stale")
    expect(putIfAbsent).toHaveBeenCalledOnce()
    expect(putIfAbsent.mock.results[0]?.value).resolves.toBe(false)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("refreshes the entry when it wins the revalidation lease", async () => {
    const kv = fakeKv()
    const putIfAbsent = vi.fn(async (key: string, value: string) => {
      if (kv.store.has(key)) return false
      kv.store.set(key, { value })
      return true
    })
    const kvWithElection = Object.assign(kv, { putIfAbsent })
    let version = 1
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ version: version++ }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }),
    )
    const app = buildApp(kvWithElection, handler)

    await app.request("/v1/public/products")
    await flush()
    vi.setSystemTime(Date.now() + 61_000)

    const refreshed = await app.request("/v1/public/products")
    await flush()

    expect(putIfAbsent).toHaveBeenCalledOnce()
    expect(await refreshed.json()).toEqual({ version: 2 })
    expect(handler).toHaveBeenCalledTimes(2)
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
