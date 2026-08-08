import { type Actor, createEventBus } from "@voyant-travel/core"
import { VOYANT_DB_SUPPORTS_TRANSACTIONS } from "@voyant-travel/db/transaction-capability"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { mountApp } from "../../src/app.js"
import {
  type ApiBundleInput,
  defineApiBundle,
  defineLazyApiBundle,
  expandApiBundles,
} from "../../src/bundle.js"
import type { ApiExtension, ApiModule } from "../../src/module.js"
import type { DbFactory, VoyantBindings, VoyantDb } from "../../src/types.js"

const TEST_ENV: VoyantBindings = { DATABASE_URL: "postgres://test" }
const TEST_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  // biome-ignore lint/suspicious/noExplicitAny: mock ExecutionContext for tests -- owner: hono; existing suppression is intentional pending typed cleanup.
} as any

function fakeDb(supportsTransactions: boolean): VoyantDb {
  const handle: Record<PropertyKey, unknown> = {
    [VOYANT_DB_SUPPORTS_TRANSACTIONS]: supportsTransactions,
  }
  return handle as VoyantDb
}

function makeModule(name: string, surface: "admin" | "public"): ApiModule {
  const routes = new Hono().get("/ping", (c) => c.json({ name, surface }))
  return {
    module: { name },
    ...(surface === "admin" ? { adminRoutes: routes } : { publicRoutes: routes }),
  }
}

describe("expandApiBundles", () => {
  it("collects bundle-declared anonymous absolute paths (ADR-0008)", () => {
    const result = expandApiBundles([
      defineApiBundle({ name: "netopia", anonymous: ["/v1/finance/providers/netopia/callback"] }),
      defineApiBundle({ name: "other", anonymous: ["/v1/foo/webhook"] }),
      defineApiBundle({ name: "no-anon", modules: [makeModule("no-anon", "public")] }),
    ])
    expect(result.anonymousPaths).toEqual([
      "/v1/finance/providers/netopia/callback",
      "/v1/foo/webhook",
    ])
  })

  it("returns empty collections for no bundles", () => {
    const result = expandApiBundles([])
    expect(result.modules).toEqual([])
    expect(result.extensions).toEqual([])
    expect(result.subscribers).toEqual([])
    expect(result.links).toEqual([])
  })

  it("flattens modules from bundles in order", () => {
    const m1 = makeModule("m1", "admin")
    const m2 = makeModule("m2", "admin")
    const bundle = defineApiBundle({ name: "p1", modules: [m1, m2] })
    const result = expandApiBundles([bundle])
    expect(result.modules).toEqual([m1, m2])
  })

  it("throws on duplicate bundle names", () => {
    const p1 = defineApiBundle({ name: "dup" })
    const p2 = defineApiBundle({ name: "dup" })
    expect(() => expandApiBundles([p1, p2])).toThrow(/Duplicate bundle name/)
  })

  it("defineApiBundle returns the bundle unchanged", () => {
    const p = defineApiBundle({ name: "x", version: "1.0.0" })
    expect(p.name).toBe("x")
    expect(p.version).toBe("1.0.0")
  })
})

describe("mountApp with plugins", () => {
  function build(plugins: ApiBundleInput[], actor: Actor = "staff") {
    return mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      plugins,
      auth: {
        resolve: () => ({
          userId: "u1",
          actor,
          realm: actor === "staff" ? "admin" : "customer",
        }),
      },
    })
  }

  it("mounts plugin-contributed admin routes", async () => {
    const plugin = defineApiBundle({
      name: "widgets",
      modules: [makeModule("widgets", "admin")],
    })
    const app = build([plugin])
    const res = await app.request("/v1/admin/widgets/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; surface: string }
    expect(body.name).toBe("widgets")
    expect(body.surface).toBe("admin")
  })

  it("mounts plugin-contributed public routes", async () => {
    const plugin = defineApiBundle({
      name: "catalog",
      modules: [makeModule("catalog", "public")],
    })
    const app = build([plugin], "customer")
    const res = await app.request("/v1/public/catalog/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
  })

  // ADR-0008: a bundle's inbound webhook mounts on the legacy `/v1/{module}`
  // surface (not `/v1/public`) via `webhookRoutes`, whose concrete paths are
  // auto-added to the anonymous allow-list. So `requireAuth` skips auth (stamping
  // no actor) and the fail-closed legacy guard lets the credential-less POST
  // through, while sibling bare paths still fail closed.
  function webhookBundle() {
    return defineApiBundle({
      name: "processor",
      extensions: [
        {
          extension: { name: "processor-finance", module: "finance" },
          webhookRoutes: new Hono().post("/providers/processor/callback", (c) =>
            c.json({ ok: true }),
          ),
        },
      ],
    })
  }

  function buildUnauthenticated(plugins: ApiBundleInput[]) {
    return mountApp({
      db: () => ({}) as never,
      plugins,
      // Simulate the processor's credential-less POST: no actor resolved.
      auth: { resolve: () => null },
    })
  }

  it("makes a bundle-declared webhook reachable without a session", async () => {
    const app = buildUnauthenticated([webhookBundle()])
    const res = await app.request(
      "/v1/finance/providers/processor/callback",
      { method: "POST" },
      TEST_ENV,
      TEST_CTX,
    )
    expect(res.status).toBe(200)
  })

  it("401s a sibling bare legacy path that is not an anonymous webhook", async () => {
    const app = buildUnauthenticated([webhookBundle()])
    const res = await app.request(
      "/v1/finance/providers/processor/not-a-webhook",
      { method: "POST" },
      TEST_ENV,
      TEST_CTX,
    )
    expect(res.status).toBe(401)
  })

  it("does not bootstrap package runtimes for rejected requests", async () => {
    const bootstrap = vi.fn()
    const app = buildUnauthenticated([defineApiBundle({ name: "private-runtime", bootstrap })])

    const res = await app.request("/v1/admin/private-runtime/ping", {}, TEST_ENV, TEST_CTX)

    expect(res.status).toBe(401)
    expect(bootstrap).not.toHaveBeenCalled()
  })

  it("combines top-level modules with plugin modules", async () => {
    const top = makeModule("top", "admin")
    const viaPlugin = makeModule("viaPlugin", "admin")
    const plugin = defineApiBundle({ name: "p", modules: [viaPlugin] })
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [top],
      plugins: [plugin],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })
    const r1 = await app.request("/v1/admin/top/ping", {}, TEST_ENV, TEST_CTX)
    const r2 = await app.request("/v1/admin/viaPlugin/ping", {}, TEST_ENV, TEST_CTX)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
  })

  it("registers plugin runtime services in the shared container", async () => {
    const spy = { called: false }
    const mod: ApiModule = {
      module: { name: "svc", service: { ping: () => "pong" } },
      adminRoutes: new Hono().get("/check", (c) => {
        const container = c.var.container
        const svc = container.resolve<{ ping: () => string }>("svc")
        spy.called = true
        return c.json({ result: svc.ping() })
      }),
    }
    const plugin = defineApiBundle({ name: "svc-plugin", modules: [mod] })
    const app = build([plugin])
    const res = await app.request("/v1/admin/svc/check", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: string }
    expect(body.result).toBe("pong")
    expect(spy.called).toBe(true)
  })

  it("throws on duplicate plugin names when passed to mountApp", () => {
    const p1 = defineApiBundle({ name: "dup" })
    const p2 = defineApiBundle({ name: "dup" })
    expect(() =>
      mountApp({
        // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
        db: () => ({}) as any,
        plugins: [p1, p2],
      }),
    ).toThrow(/Duplicate (plugin|bundle) name/)
  })

  it("loads lazy plugin bundles on first request instead of app construction", async () => {
    let loads = 0
    const app = build([
      defineLazyApiBundle({
        name: "lazy-widgets",
        routes: ["/v1/admin/lazy-widgets/ping"],
        load: async () => {
          loads += 1
          return defineApiBundle({
            name: "lazy-widgets",
            modules: [makeModule("lazy-widgets", "admin")],
          })
        },
      }),
    ])

    expect(loads).toBe(0)
    const first = await app.request("/v1/admin/lazy-widgets/ping", {}, TEST_ENV, TEST_CTX)
    const second = await app.request("/v1/admin/lazy-widgets/ping", {}, TEST_ENV, TEST_CTX)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(loads).toBe(1)
  })

  it("routes the first lazy transactional plugin request to dbTransactional", async () => {
    const defaultFactory = vi.fn<DbFactory>(() => fakeDb(false))
    const transactionalFactory = vi.fn<DbFactory>(() => fakeDb(true))
    let loads = 0
    const app = mountApp({
      db: defaultFactory,
      dbTransactional: transactionalFactory,
      plugins: [
        defineLazyApiBundle({
          name: "lazy-ledger",
          routes: ["/v1/admin/lazy-ledger/commit"],
          transactionalModules: ["lazy-ledger"],
          load: async () => {
            loads += 1
            return defineApiBundle({
              name: "lazy-ledger",
              modules: [
                {
                  module: { name: "lazy-ledger", requiresTransactionalDb: true },
                  adminRoutes: new Hono().post("/commit", (c) => c.json({ ok: true })),
                },
              ],
            })
          },
        }),
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const res = await app.request(
      "/v1/admin/lazy-ledger/commit",
      { method: "POST" },
      TEST_ENV,
      TEST_CTX,
    )

    expect(res.status).toBe(200)
    expect(loads).toBe(1)
    expect(transactionalFactory).toHaveBeenCalled()
    expect(defaultFactory).not.toHaveBeenCalled()
  })

  it("wires plugin subscribers to the app event bus", async () => {
    const handler = vi.fn()
    const plugin = defineApiBundle({
      name: "events",
      subscribers: [{ event: "booking.created", handler }],
      modules: [
        {
          module: { name: "events" },
          adminRoutes: new Hono().post("/emit", async (c) => {
            await c.var.eventBus.emit("booking.created", { bookingId: "b_123" })
            return c.json({ ok: true })
          }),
        },
      ],
    })

    const app = build([plugin])
    const res = await app.request("/v1/admin/events/emit", { method: "POST" }, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        name: "booking.created",
        data: { bookingId: "b_123" },
      }),
    )
  })

  it("runs plugin, module, and extension bootstraps once in order", async () => {
    const calls: string[] = []
    const mod: ApiModule = {
      module: {
        name: "boot",
        bootstrap: () => {
          calls.push("module")
        },
      },
      adminRoutes: new Hono().get("/ping", (c) => c.json({ ok: true })),
    }
    const ext: ApiExtension = {
      extension: {
        name: "boot-ext",
        module: "boot",
        bootstrap: () => {
          calls.push("extension")
        },
      },
    }
    const plugin = defineApiBundle({
      name: "boot-plugin",
      bootstrap: () => {
        calls.push("plugin")
      },
      modules: [mod],
      extensions: [ext],
    })

    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      plugins: [plugin],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const r1 = await app.request("/v1/admin/boot/ping", {}, TEST_ENV, TEST_CTX)
    const r2 = await app.request("/v1/admin/boot/ping", {}, TEST_ENV, TEST_CTX)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(calls).toEqual(["plugin", "module", "extension"])
  })

  it("keeps concurrent first requests off the bootstrap path after explicit readiness", async () => {
    const bootstrap = vi.fn(async () => undefined)
    const mod: ApiModule = {
      module: { name: "ready", bootstrap },
      adminRoutes: new Hono().get("/ping", (c) => c.json({ ok: true })),
    }
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [mod],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    await app.ready(TEST_ENV)
    const responses = await Promise.all([
      app.request("/v1/admin/ready/ping", {}, TEST_ENV, TEST_CTX),
      app.request("/v1/admin/ready/ping", {}, TEST_ENV, TEST_CTX),
    ])

    expect(responses.map(({ status }) => status)).toEqual([200, 200])
    expect(bootstrap).toHaveBeenCalledTimes(1)
  })

  it("isolates bootstrap failures — a throwing plugin must not break unrelated routes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const goodModule: ApiModule = {
      module: {
        name: "good",
        bootstrap: ({ container }) => {
          container.register("good.runtime", { ok: true })
        },
      },
      adminRoutes: new Hono().get("/ping", (c) => {
        const runtime = c.var.container.resolve<{ ok: boolean }>("good.runtime")
        return c.json(runtime)
      }),
    }
    const throwingPlugin = defineApiBundle({
      name: "throwing",
      bootstrap: () => {
        throw new Error("missing env NETOPIA_URL")
      },
    })

    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      plugins: [throwingPlugin],
      modules: [goodModule],
      auth: {
        resolve: () => ({ userId: "u1", actor: "staff" as Actor, realm: "admin" }),
      },
    })

    // First request: bootstrap runs; throwing plugin is logged but does not block pipeline.
    const r1 = await app.request("/v1/admin/good/ping", {}, TEST_ENV, TEST_CTX)
    expect(r1.status).toBe(200)
    await expect(r1.json()).resolves.toEqual({ ok: true })

    // Second request: cached bootstrap promise must resolve (not reject), so this still succeeds.
    const r2 = await app.request("/v1/admin/good/ping", {}, TEST_ENV, TEST_CTX)
    expect(r2.status).toBe(200)

    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/plugin:throwing/))
    errorSpy.mockRestore()
  })

  it("exposes bootstrap-registered runtime services through the shared container", async () => {
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [
        {
          module: {
            name: "runtime",
            bootstrap: ({ container }) => {
              container.register("runtime.registry", { status: "ready" })
            },
          },
          adminRoutes: new Hono().get("/check", (c) => {
            const runtime = c.var.container.resolve<{ status: string }>("runtime.registry")
            return c.json(runtime)
          }),
        },
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const res = await app.request("/v1/admin/runtime/check", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: "ready" })
  })

  it("uses a caller-provided event bus when supplied", async () => {
    const bus = createEventBus()
    const handler = vi.fn()
    bus.subscribe("booking.updated", handler)

    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      eventBus: bus,
      modules: [
        {
          module: { name: "bus" },
          adminRoutes: new Hono().post("/emit", async (c) => {
            await c.var.eventBus.emit("booking.updated", { bookingId: "b_234" })
            return c.json({ ok: true })
          }),
        },
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const res = await app.request("/v1/admin/bus/emit", { method: "POST" }, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        name: "booking.updated",
        data: { bookingId: "b_234" },
      }),
    )
  })
})
