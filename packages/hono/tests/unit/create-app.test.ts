import type { Actor } from "@voyant-travel/core"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import type { CompositionRegistry } from "../../src/composition.js"
import { createApp } from "../../src/create-app.js"
import { lazyProvider } from "../../src/lazy-provider.js"

interface Caps {
  greeting: string
}

// A registry whose factory reads `capabilities` — proving the config-driven
// front door threads capabilities through to each entry.
const registry: CompositionRegistry<Caps> = {
  modules: {
    "@voyant-travel/demo": ({ capabilities }) => ({
      module: { name: "demo" },
      adminRoutes: new Hono().get("/ping", (c) => c.text(capabilities.greeting)),
    }),
  },
}

function build() {
  return createApp<Record<string, never>, Caps>({
    manifest: { modules: ["@voyant-travel/demo"] },
    registry,
    capabilities: { greeting: "pong" },
    // biome-ignore lint/suspicious/noExplicitAny: stub db for the mount smoke test.
    db: () => ({}) as any,
    auth: {
      resolve: ({ request }) => {
        const customer = new URL(request.url).pathname.startsWith("/v1/public/")
        return {
          userId: "u1",
          actor: (customer ? "customer" : "staff") as Actor,
          realm: customer ? "customer" : "admin",
        }
      },
    },
  })
}

describe("createApp (config-driven front door)", () => {
  it("derives modules from manifest+registry and mounts them, threading capabilities", async () => {
    const app = build()
    const res = await app.request("/v1/admin/demo/ping", {}, {} as never)
    expect(res.status).toBe(200)
    // The body is the capability value, so it flowed manifest → registry → mount.
    expect(await res.text()).toBe("pong")
  })

  it("does not mount entries absent from the manifest", async () => {
    const app = build()
    const res = await app.request("/v1/admin/not-mounted/x", {}, {} as never)
    expect(res.status).toBe(404)
  })

  it("supports memoized lazy provider values", async () => {
    interface LazyCaps {
      service: { greet: () => Promise<string> }
    }

    let loads = 0
    const lazyRegistry: CompositionRegistry<LazyCaps> = {
      modules: {
        "@voyant-travel/lazy-demo": ({ capabilities }) => ({
          module: { name: "lazy-demo" },
          adminRoutes: new Hono().get("/ping", async (c) =>
            c.text(await capabilities.service.greet()),
          ),
        }),
      },
    }

    const app = createApp<Record<string, never>, LazyCaps>({
      manifest: { modules: ["@voyant-travel/lazy-demo"] },
      registry: lazyRegistry,
      capabilities: {
        service: lazyProvider(async () => {
          loads += 1
          return { greet: async () => "lazy-pong" }
        }),
      },
      db: () => ({}) as never,
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    expect(loads).toBe(0)
    const first = await app.request("/v1/admin/lazy-demo/ping", {}, {} as never)
    const second = await app.request("/v1/admin/lazy-demo/ping", {}, {} as never)
    expect(await first.text()).toBe("lazy-pong")
    expect(await second.text()).toBe("lazy-pong")
    expect(loads).toBe(1)
  })
})

describe("observability sink on the request context (RFC #1553)", () => {
  it("exposes the deployment reporter so composed modules can emit their own telemetry", async () => {
    const captured: string[] = []
    const seen: { reporter?: unknown; appName?: unknown } = {}

    const app = createApp<Record<string, never>, Caps>({
      manifest: { modules: ["@voyant-travel/probe"] },
      registry: {
        modules: {
          "@voyant-travel/probe": () => ({
            module: { name: "probe" },
            adminRoutes: new Hono().get("/ping", (c) => {
              seen.reporter = c.get("reporter")
              seen.appName = c.get("appName")
              return c.text("ok")
            }),
          }),
        },
      },
      capabilities: { greeting: "pong" },
      appName: "probe-app",
      reporter: { captureException: (event) => captured.push(String(event.message)) },
      // biome-ignore lint/suspicious/noExplicitAny: stub db for the mount smoke test.
      db: () => ({}) as any,
      auth: {
        resolve: () => ({ userId: "u1", actor: "staff" as Actor, realm: "admin" as const }),
      },
    })

    const response = await app.request("/v1/admin/probe/ping", {}, {} as never)

    expect(response.status).toBe(200)
    // A composed module must reach the SAME sink the error boundary uses,
    // without the deployment threading a reporter through every seam.
    expect(seen.appName).toBe("probe-app")
    expect(seen.reporter).toBeDefined()
    ;(seen.reporter as { captureException: (e: { message: string }) => void }).captureException({
      message: "from a composed module",
    })
    expect(captured).toContain("from a composed module")
  })

  it("falls back to a no-op sink rather than leaving the context empty", async () => {
    let reporter: unknown
    const app = createApp<Record<string, never>, Caps>({
      manifest: { modules: ["@voyant-travel/probe"] },
      registry: {
        modules: {
          "@voyant-travel/probe": () => ({
            module: { name: "probe" },
            adminRoutes: new Hono().get("/ping", (c) => {
              reporter = c.get("reporter")
              return c.text("ok")
            }),
          }),
        },
      },
      capabilities: { greeting: "pong" },
      // biome-ignore lint/suspicious/noExplicitAny: stub db for the mount smoke test.
      db: () => ({}) as any,
      auth: {
        resolve: () => ({ userId: "u1", actor: "staff" as Actor, realm: "admin" as const }),
      },
    })

    await app.request("/v1/admin/probe/ping", {}, {} as never)

    // Never undefined: a module that emits unconditionally must not crash on a
    // deployment that configured no sink.
    expect(reporter).toBeDefined()
  })
})
