import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { mountApp } from "../../src/app.js"
import type { ApiExtension, ApiModule } from "../../src/module.js"
import type { VoyantBindings } from "../../src/types.js"

const TEST_ENV: VoyantBindings = { DATABASE_URL: "postgres://test" }
const TEST_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  // biome-ignore lint/suspicious/noExplicitAny: mock ExecutionContext for tests -- owner: hono.
} as any

describe("mountApp lazy route mounting", () => {
  it("propagates a throwing lazy route to mountApp's error boundary (parity with eager)", async () => {
    const boom = () => {
      throw new Error("lazy handler boom")
    }
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono.
      db: () => ({}) as any,
      modules: [
        // Eager route that throws — the normalization baseline.
        { module: { name: "eager" }, adminRoutes: new Hono().get("/boom", boom) },
        // Lazy route that throws — must match.
        { module: { name: "lazy" }, lazyAdminRoutes: async () => new Hono().get("/boom", boom) },
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const eager = await app.request("/v1/admin/eager/boom", {}, TEST_ENV, TEST_CTX)
    const lazy = await app.request("/v1/admin/lazy/boom", {}, TEST_ENV, TEST_CTX)

    expect(lazy.status).toBe(eager.status)
    expect(lazy.headers.get("content-type")).toContain("application/json")
    // Normalized error shape from handleApiError — NOT a plain Hono 500 text body.
    const body = (await lazy.json()) as { error?: string; requestId?: string }
    expect(body.error).toBeTypeOf("string")
    expect(body).toHaveProperty("requestId")
  })

  it("mounts lazyAdminRoutes under /v1/admin/{name} and bridges the request context", async () => {
    const marker = { name: "leased-db" }
    const load = vi.fn(async () =>
      // Relative routes, exactly like eager adminRoutes.
      new Hono().get("/ping", (c) =>
        c.json({ surface: "lazy-admin", db: (c.get("db") as { name: string }).name }),
      ),
    )
    const mod: ApiModule = { module: { name: "flights" }, lazyAdminRoutes: load }

    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: structural db client -- owner: hono.
      db: () => marker as any,
      modules: [mod],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    // Not loaded until the first matching request.
    expect(load).not.toHaveBeenCalled()

    const res = await app.request("/v1/admin/flights/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { surface: string; db: string }
    expect(body.surface).toBe("lazy-admin")
    // Context bridged: the lazy route saw the db the mountApp middleware leased.
    expect(body.db).toBe("leased-db")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("does not let a lazy extension wildcard shadow a later eager extension route", async () => {
    const loadMaintenance = vi.fn(async () =>
      new Hono().post("/:id/rebuild-tax-lines", (c) => c.json({ maintenance: true })),
    )
    const lazyExtension: ApiExtension = {
      extension: { name: "booking-maintenance", module: "bookings" },
      lazyAdminRoutes: loadMaintenance,
    }
    const eagerExtension: ApiExtension = {
      extension: { name: "mice-booking", module: "bookings" },
      adminRoutes: new Hono().get("/:id/mice-details", (c) => c.json({ mounted: true })),
    }

    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono.
      db: () => ({}) as any,
      modules: [{ module: { name: "bookings" } }],
      extensions: [lazyExtension, eagerExtension],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const res = await app.request(
      "/v1/admin/bookings/book_123/mice-details",
      {},
      TEST_ENV,
      TEST_CTX,
    )
    expect(res.status).toBe(200)
    expect((await res.json()) as { mounted: boolean }).toEqual({ mounted: true })
    expect(loadMaintenance).not.toHaveBeenCalled()
  })

  it("falls through only for lazy route misses, not handler-authored 404 responses", async () => {
    const firstLoad = vi.fn(async () =>
      new Hono().get("/:id/details", (c) =>
        c.json({ error: `booking ${c.req.param("id")} not found` }, 404),
      ),
    )
    const secondLoad = vi.fn(async () =>
      new Hono()
        .get("/:id/notes", (c) => c.json({ notes: c.req.param("id") }))
        .get("/:id/details", (c) => c.json({ fallback: true })),
    )
    const firstExtension: ApiExtension = {
      extension: { name: "first", module: "bookings" },
      lazyAdminRoutes: firstLoad,
    }
    const secondExtension: ApiExtension = {
      extension: { name: "second", module: "bookings" },
      lazyAdminRoutes: secondLoad,
    }

    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono.
      db: () => ({}) as any,
      modules: [{ module: { name: "bookings" } }],
      extensions: [firstExtension, secondExtension],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const resource404 = await app.request(
      "/v1/admin/bookings/book_123/details",
      {},
      TEST_ENV,
      TEST_CTX,
    )
    expect(resource404.status).toBe(404)
    expect(await resource404.json()).toEqual({ error: "booking book_123 not found" })
    expect(secondLoad).not.toHaveBeenCalled()

    const routeMiss = await app.request("/v1/admin/bookings/book_123/notes", {}, TEST_ENV, TEST_CTX)
    expect(routeMiss.status).toBe(200)
    expect(await routeMiss.json()).toEqual({ notes: "book_123" })
    expect(firstLoad).toHaveBeenCalledTimes(1)
    expect(secondLoad).toHaveBeenCalledTimes(1)
  })

  it("caches the loaded sub-app across requests (load once per isolate)", async () => {
    const load = vi.fn(async () => new Hono().get("/ping", (c) => c.json({ ok: true })))
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono.
      db: () => ({}) as any,
      modules: [{ module: { name: "flights" }, lazyAdminRoutes: load }],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/v1/admin/flights/ping", {}, TEST_ENV, TEST_CTX)
      expect(res.status).toBe(200)
    }
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("mounts lazyPublicRoutes under /v1/public/{name} for customer-facing actors", async () => {
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono.
      db: () => ({}) as any,
      modules: [
        {
          module: { name: "checkout" },
          lazyPublicRoutes: async () =>
            new Hono().get("/ping", (c) => c.json({ surface: "lazy-public" })),
          // Secret-key-only without this (voyant#4625); the assertion here is
          // about where a lazy public family mounts.
          publishable: true,
        },
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "customer", realm: "customer" }) },
    })

    const res = await app.request("/v1/public/checkout/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { surface: string }).surface).toBe("lazy-public")
  })

  it("applies actor guards to lazy routes (blocks customer on /v1/admin/*)", async () => {
    const load = vi.fn(async () => new Hono().get("/ping", (c) => c.json({ ok: true })))
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono.
      db: () => ({}) as any,
      modules: [{ module: { name: "flights" }, lazyAdminRoutes: load }],
      auth: { resolve: () => ({ userId: "u1", actor: "customer", realm: "customer" }) },
    })

    const res = await app.request("/v1/admin/flights/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(401)
    // Auth rejects the cross-realm identity before the route bundle is imported.
    expect(load).not.toHaveBeenCalled()
  })

  it("mounts a multi-prefix lazyRoutes family at explicit absolute paths, context bridged", async () => {
    const load = vi.fn(async () =>
      // Absolute routes spanning several admin prefixes — a deployment-local bundle.
      new Hono()
        .get("/v1/admin/uploads", (c) =>
          c.json({ at: "uploads", db: (c.get("db") as string) ?? null }),
        )
        .get("/v1/admin/media/x", (c) => c.json({ at: "media" })),
    )
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: structural db client -- owner: hono.
      db: () => "leased-db" as any,
      modules: [
        {
          module: { name: "media" },
          lazyRoutes: {
            paths: ["/v1/admin/uploads", "/v1/admin/media/*"],
            load,
          },
        },
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const uploads = await app.request("/v1/admin/uploads", {}, TEST_ENV, TEST_CTX)
    expect(uploads.status).toBe(200)
    const body = (await uploads.json()) as { at: string; db: string }
    expect(body.at).toBe("uploads")
    expect(body.db).toBe("leased-db") // context bridged across the forward

    const media = await app.request("/v1/admin/media/x", {}, TEST_ENV, TEST_CTX)
    expect(media.status).toBe(200)
    expect(((await media.json()) as { at: string }).at).toBe("media")

    expect(load).toHaveBeenCalledTimes(1) // one shared cached handler
  })

  it("does not cache a failed load — a later request can recover", async () => {
    let attempt = 0
    const load = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) throw new Error("transient import failure")
      return new Hono().get("/ping", (c) => c.json({ ok: true }))
    })
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono.
      db: () => ({}) as any,
      modules: [{ module: { name: "flights" }, lazyAdminRoutes: load }],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const first = await app.request("/v1/admin/flights/ping", {}, TEST_ENV, TEST_CTX)
    expect(first.status).toBe(500)

    const second = await app.request("/v1/admin/flights/ping", {}, TEST_ENV, TEST_CTX)
    expect(second.status).toBe(200)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
