import {
  type Actor,
  createQueryContext,
  defineLink,
  type EntityFetcher,
  type LinkService,
} from "@voyant-travel/core"
import { VOYANT_DB_DISPOSE } from "@voyant-travel/db/transaction-capability"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { mountApp } from "../../src/app.js"
import type { ApiModule } from "../../src/module.js"
import type { VoyantBindings } from "../../src/types.js"

const TEST_ENV: VoyantBindings = { DATABASE_URL: "postgres://test" }

const TEST_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  // biome-ignore lint/suspicious/noExplicitAny: mock ExecutionContext for tests -- owner: hono; existing suppression is intentional pending typed cleanup.
} as any

function makeModule(options: {
  name: string
  admin?: boolean
  public_?: boolean
  publicPath?: string
}): ApiModule {
  const admin = new Hono().get("/ping", (c) => c.json({ surface: "admin", name: options.name }))
  const pub = new Hono().get("/ping", (c) => c.json({ surface: "public", name: options.name }))

  return {
    module: { name: options.name },
    ...(options.admin ? { adminRoutes: admin } : {}),
    // A public mount with no `publishable` declaration is secret-key-only
    // (voyant#4625), so these surface-mounting fixtures declare one — they are
    // asserting where routes mount, not what the capability line does.
    ...(options.public_ ? { publicRoutes: pub, publishable: true } : {}),
    ...(options.publicPath ? { publicPath: options.publicPath } : {}),
  }
}

/**
 * Builds a test app that resolves every request to `{ userId, actor }`, so
 * that requireAuth marks the request authenticated and requireActor sees the
 * intended actor.
 */
function build(actor: Actor | undefined, mods: ApiModule[], publicPaths: string[] = []) {
  return mountApp({
    // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
    db: () => ({}) as any,
    modules: mods,
    publicPaths,
    auth: {
      resolve: () =>
        actor === undefined
          ? null
          : { userId: "u1", actor, realm: actor === "staff" ? "admin" : "customer" },
    },
  })
}

describe("mountApp surface mounting", () => {
  it("disposes db clients tagged with package-level dispose metadata", async () => {
    const dispose = vi.fn(async () => {})
    const db = Object.defineProperty({}, VOYANT_DB_DISPOSE, {
      value: dispose,
    })
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      void promise
    })
    const mod: ApiModule = {
      module: { name: "things" },
      adminRoutes: new Hono().get("/ping", (c) => {
        expect(c.get("db")).toBe(db)
        return c.json({ ok: true })
      }),
    }
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: structural db client for disposal test -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => db as any,
      modules: [mod],
    })

    const res = await app.request(
      "/v1/admin/things/ping",
      { headers: { Authorization: "Bearer internal-test-key" } },
      { ...TEST_ENV, INTERNAL_API_KEY: "internal-test-key" },
      { ...TEST_CTX, waitUntil },
    )

    expect(res.status).toBe(200)
    expect(waitUntil).toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it("mounts adminRoutes under /v1/admin/{name}", async () => {
    const app = build("staff", [makeModule({ name: "things", admin: true })])
    const res = await app.request("/v1/admin/things/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { surface: string }
    expect(body.surface).toBe("admin")
  })

  it("serves capabilities at /v1/admin/_meta/capabilities when adminMeta is provided", async () => {
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [
        makeModule({ name: "bookings", admin: true }),
        makeModule({ name: "finance", admin: true }),
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
      adminMeta: {
        contractVersion: "0.1.0",
        deploymentVersion: "2026.06.01",
        operations: [
          {
            id: "bookings.confirm",
            method: "POST",
            pathTemplate: "/v1/admin/bookings/:id/confirm",
            classification: "requires_confirmation",
            scopes: ["bookings:write"],
          },
        ],
      },
    })
    const res = await app.request("/v1/admin/_meta/capabilities", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      contractVersion: string
      deploymentVersion?: string
      modules: string[]
      operations: { id: string }[]
      actor?: string
    }
    expect(body.contractVersion).toBe("0.1.0")
    expect(body.deploymentVersion).toBe("2026.06.01")
    expect(body.modules).toEqual(["bookings", "finance"])
    expect(body.operations[0]?.id).toBe("bookings.confirm")
    expect(body.actor).toBe("staff")
  })

  it("does not mount the capabilities route when adminMeta is omitted", async () => {
    const app = build("staff", [makeModule({ name: "things", admin: true })])
    const res = await app.request("/v1/admin/_meta/capabilities", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(404)
  })

  it("mounts publicRoutes under /v1/public/{name}", async () => {
    const app = build("customer", [makeModule({ name: "things", public_: true })])
    const res = await app.request("/v1/public/things/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { surface: string }
    expect(body.surface).toBe("public")
  })

  it("allows modules to mount publicRoutes at the public root", async () => {
    const app = build("customer", [
      makeModule({ name: "storefront", public_: true, publicPath: "/" }),
    ])
    const res = await app.request("/v1/public/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { surface: string }
    expect(body.surface).toBe("public")
  })

  // Bare `/v1/{name}` no longer has a catch-all actor guard. Only explicitly
  // mounted webhook routes can live there; ordinary module surfaces stay under
  // `/v1/admin/*` or `/v1/public/*`.
  it("does not mount ordinary modules on bare /v1/{name} paths", async () => {
    const app = build("customer", [makeModule({ name: "things" })], ["/v1/things/ping"])
    const res = await app.request("/v1/things/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(404)
  })

  it("returns 404 on bare /v1/{name} paths when actor is unresolved", async () => {
    const app = build(undefined, [makeModule({ name: "things" })], ["/v1/things/ping"])
    const res = await app.request("/v1/things/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(404)
  })

  it("blocks customer on /v1/admin/*", async () => {
    const app = build("customer", [makeModule({ name: "only-admin", admin: true })])
    const res = await app.request("/v1/admin/only-admin/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(401)
  })

  it("blocks staff on /v1/public/*", async () => {
    const app = build("staff", [makeModule({ name: "only-public", public_: true })])
    const res = await app.request("/v1/public/only-public/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(401)
  })

  it("allows partner on /v1/public/*", async () => {
    const app = build("partner", [makeModule({ name: "things", public_: true })])
    const res = await app.request("/v1/public/things/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
  })

  it("allows supplier on /v1/public/*", async () => {
    const app = build("supplier", [makeModule({ name: "things", public_: true })])
    const res = await app.request("/v1/public/things/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
  })

  it("returns 401 on /v1/admin/* when actor is unresolved", async () => {
    const app = build(undefined, [makeModule({ name: "things", admin: true })])
    const res = await app.request("/v1/admin/things/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(401)
  })

  it("supports a module exposing both admin and public routes", async () => {
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [makeModule({ name: "bookings", admin: true, public_: true })],
      auth: {
        resolve: (args) => {
          const actor: Actor = new URL(args.request.url).pathname.startsWith("/v1/admin/")
            ? "staff"
            : "customer"
          return {
            userId: "u1",
            actor,
            realm: actor === "staff" ? "admin" : "customer",
          }
        },
      },
    })

    const adminRes = await app.request("/v1/admin/bookings/ping", {}, TEST_ENV, TEST_CTX)
    expect(adminRes.status).toBe(200)
    expect(((await adminRes.json()) as { surface: string }).surface).toBe("admin")

    const publicRes = await app.request("/v1/public/bookings/ping", {}, TEST_ENV, TEST_CTX)
    expect(publicRes.status).toBe(200)
    expect(((await publicRes.json()) as { surface: string }).surface).toBe("public")
  })

  it("treats public-path bypasses under /v1/public/* as customer-facing requests", async () => {
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [makeModule({ name: "checkout", public_: true })],
      publicPaths: ["/v1/public/checkout"],
    })

    const res = await app.request("/v1/public/checkout/ping", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { surface: string }).surface).toBe("public")
  })

  it("treats module-declared public offers paths as anonymous while protecting other surfaces", async () => {
    const publicRoutes = new Hono()
      .get("/offers/:slug", (c) => c.json({ route: "detail", actor: c.get("actor") }))
      .post("/offers/:slug/apply", (c) => c.json({ route: "apply", actor: c.get("actor") }))
      .post("/offers/redeem", (c) => c.json({ route: "redeem", actor: c.get("actor") }))
      .get("/account", (c) => c.json({ route: "account", actor: c.get("actor") }))
    const adminRoutes = new Hono().get("/offers", (c) =>
      c.json({ route: "admin-offers", actor: c.get("actor") }),
    )
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [
        {
          module: { name: "storefront" },
          adminRoutes,
          publicPath: "/",
          publicRoutes,
          anonymous: ["/offers"],
          // `anonymous` and `publishable` answer different questions: this
          // fixture needs both, and `/account` gets neither.
          publishable: ["/offers"],
        },
      ],
    })

    const detail = await app.request("/v1/public/offers/summer-sale", {}, TEST_ENV, TEST_CTX)
    const apply = await app.request(
      "/v1/public/offers/summer-sale/apply",
      { method: "POST" },
      TEST_ENV,
      TEST_CTX,
    )
    const redeem = await app.request(
      "/v1/public/offers/redeem",
      { method: "POST" },
      TEST_ENV,
      TEST_CTX,
    )
    const privatePublic = await app.request("/v1/public/account", {}, TEST_ENV, TEST_CTX)
    const admin = await app.request("/v1/admin/storefront/offers", {}, TEST_ENV, TEST_CTX)

    expect(detail.status).toBe(200)
    expect(await detail.json()).toEqual({ route: "detail" })
    expect(apply.status).toBe(200)
    expect(await apply.json()).toEqual({ route: "apply" })
    expect(redeem.status).toBe(200)
    expect(await redeem.json()).toEqual({ route: "redeem" })
    expect(privatePublic.status).toBe(401)
    expect(admin.status).toBe(401)
  })

  it("exposes /health publicly without auth", async () => {
    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      modules: [],
    })
    const res = await app.request("/health", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe("ok")
  })

  it("exposes caller-supplied link and query runtimes on the request context", async () => {
    const person = { module: "crm", entity: "person", table: "people" }
    const product = { module: "catalog", entity: "product", table: "products" }
    const link = defineLink(person, { linkable: product, isList: true })
    const linkService: LinkService = {
      create: vi.fn(),
      dismiss: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(async () => []),
      // biome-ignore lint/suspicious/noExplicitAny: LinkService has overloaded signatures -- owner: hono; existing suppression is intentional pending typed cleanup.
    } as any
    const fetcher: EntityFetcher = {
      list: vi.fn(async () => [{ id: "pers_1", name: "Alice" }]),
    }
    const query = createQueryContext({ person: fetcher }, [link], linkService)

    const app = mountApp({
      // biome-ignore lint/suspicious/noExplicitAny: test doesn't use db -- owner: hono; existing suppression is intentional pending typed cleanup.
      db: () => ({}) as any,
      link: linkService,
      query,
      modules: [
        {
          module: { name: "runtime" },
          adminRoutes: new Hono().get("/inspect", async (c) => {
            const rows = await c.var.link?.list(link.tableName, { leftId: "pers_1" })
            const result = await c.var.query?.({ entity: "person", fields: ["id", "name"] })
            return c.json({
              hasLink: c.var.link === linkService,
              rowCount: rows?.length ?? -1,
              resultCount: result?.data.length ?? -1,
            })
          }),
        },
      ],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const res = await app.request("/v1/admin/runtime/inspect", {}, TEST_ENV, TEST_CTX)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      hasLink: true,
      rowCount: 0,
      resultCount: 1,
    })
    expect(linkService.list).toHaveBeenCalledWith(link.tableName, { leftId: "pers_1" })
    expect(fetcher.list).toHaveBeenCalledWith({ filters: undefined, pagination: undefined })
  })

  it("rejects an explicit link service combined with link definitions", () => {
    const definition = defineLink(
      { module: "crm", entity: "person", table: "people" },
      { module: "catalog", entity: "product", table: "products" },
    )
    const linkService: LinkService = {
      create: vi.fn(),
      dismiss: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(async () => []),
      // biome-ignore lint/suspicious/noExplicitAny: LinkService has overloaded signatures -- owner: hono; test only needs identity.
    } as any

    expect(() =>
      mountApp({
        // biome-ignore lint/suspicious/noExplicitAny: startup validation does not use db -- owner: hono.
        db: () => ({}) as any,
        link: linkService,
        linkDefinitions: [definition],
      }),
    ).toThrow("cannot configure both an explicit link service and link definitions")
  })

  it("validates duplicate configured and eager-bundle link tables at startup", () => {
    const definition = defineLink(
      { module: "crm", entity: "person", table: "people" },
      { module: "catalog", entity: "product", table: "products" },
    )

    expect(() =>
      mountApp({
        // biome-ignore lint/suspicious/noExplicitAny: startup validation does not use db -- owner: hono.
        db: () => ({}) as any,
        linkDefinitions: [definition],
        plugins: [{ name: "catalog-links", links: [definition] }],
      }),
    ).toThrow(`duplicate link definition for table "${definition.tableName}"`)
  })

  it("combines configured and eager-bundle links in a service bound to each request db", async () => {
    const personProduct = defineLink(
      { module: "crm", entity: "person", table: "people" },
      { module: "catalog", entity: "product", table: "products" },
    )
    const organizationOrder = defineLink(
      { module: "crm", entity: "organization", table: "organizations" },
      { module: "sales", entity: "order", table: "orders" },
    )
    const requestDbs: Array<{ execute: ReturnType<typeof vi.fn> }> = []
    const requestServices: LinkService[] = []
    const adminRoutes = new Hono().get("/inspect", async (c) => {
      const link = c.var.link
      if (!link) return c.json({ error: "missing link service" }, 500)
      requestServices.push(link)
      await link.list(personProduct.tableName)
      await link.list(organizationOrder.tableName)
      return c.json({ ok: true })
    })
    const app = mountApp({
      db: () => {
        const requestDb = { execute: vi.fn(async () => []) }
        requestDbs.push(requestDb)
        // biome-ignore lint/suspicious/noExplicitAny: structural Drizzle client for request-scoping test -- owner: hono.
        return requestDb as any
      },
      linkDefinitions: [personProduct],
      plugins: [{ name: "sales-links", links: [organizationOrder] }],
      modules: [{ module: { name: "runtime" }, adminRoutes }],
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    const first = await app.request("/v1/admin/runtime/inspect", {}, TEST_ENV, TEST_CTX)
    const second = await app.request("/v1/admin/runtime/inspect", {}, TEST_ENV, TEST_CTX)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(requestServices).toHaveLength(2)
    expect(requestServices[0]).not.toBe(requestServices[1])
    expect(requestDbs).toHaveLength(2)
    expect(requestDbs[0]?.execute).toHaveBeenCalledTimes(2)
    expect(requestDbs[1]?.execute).toHaveBeenCalledTimes(2)
  })
})
