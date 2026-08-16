import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import {
  generateModuleOpenApiDocuments,
  type ModuleMount,
  type OpenApiDocument,
  splitDocumentByModule,
  stampModuleMetadata,
} from "../../src/openapi.js"

const INFO = { title: "Test", version: "0.0.0" } as const

/** Build a tiny OpenAPIHono sub-app exposing one documented GET at `path`. */
function docApp(path: string): OpenAPIHono {
  const app = new OpenAPIHono()
  app.openapi(
    createRoute({
      method: "get",
      path,
      responses: {
        200: {
          description: "ok",
          content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
        },
      },
    }),
    (c) => c.json({ ok: true }),
  )
  return app
}

describe("generateModuleOpenApiDocuments", () => {
  it("groups mounts by module name and prefixes paths at their real mount", async () => {
    const mounts: ModuleMount[] = [
      { moduleName: "bookings", prefix: "/v1/admin/bookings", load: () => docApp("/") },
      { moduleName: "bookings", prefix: "/v1/public/bookings", load: () => docApp("/quote") },
      { moduleName: "finance", prefix: "/v1/admin/finance", load: () => docApp("/invoices") },
    ]

    const docs = await generateModuleOpenApiDocuments(mounts, { info: INFO })

    expect([...docs.keys()].sort()).toEqual(["bookings", "finance"])
    // A module doc spans both surfaces, at real absolute paths.
    expect(Object.keys(docs.get("bookings")?.paths ?? {}).sort()).toEqual([
      "/v1/admin/bookings",
      "/v1/public/bookings/quote",
    ])
    expect(Object.keys(docs.get("finance")?.paths ?? {})).toEqual(["/v1/admin/finance/invoices"])
  })

  it("honors publicPath overrides whose prefix isn't the module name", async () => {
    const mounts: ModuleMount[] = [
      { moduleName: "commerce", prefix: "/v1/public/booking-engine", load: () => docApp("/hold") },
    ]

    const docs = await generateModuleOpenApiDocuments(mounts, { info: INFO })

    // File would be commerce.json, but the path keeps the real booking-engine mount.
    expect(Object.keys(docs.get("commerce")?.paths ?? {})).toEqual([
      "/v1/public/booking-engine/hold",
    ])
  })

  it("skips plain Hono sub-apps and loaders that throw, without failing the module", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const mounts: ModuleMount[] = [
      // Plain Hono → no `.openapi()` registry → contributes nothing.
      { moduleName: "plain", prefix: "/v1/admin/plain", load: () => new Hono() },
      // Throwing loader → skipped with a warning.
      {
        moduleName: "broken",
        prefix: "/v1/admin/broken",
        load: () => {
          throw new Error("boom")
        },
      },
      { moduleName: "ok", prefix: "/v1/admin/ok", load: () => docApp("/ping") },
    ]

    const docs = await generateModuleOpenApiDocuments(mounts, { info: INFO })

    // Only the module that produced a documented operation survives.
    expect([...docs.keys()]).toEqual(["ok"])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it("awaits async (lazy) loaders", async () => {
    const mounts: ModuleMount[] = [
      {
        moduleName: "flights",
        prefix: "/v1/admin/flights",
        load: async () => docApp("/search"),
      },
    ]

    const docs = await generateModuleOpenApiDocuments(mounts, { info: INFO })

    expect(Object.keys(docs.get("flights")?.paths ?? {})).toEqual(["/v1/admin/flights/search"])
  })
})

describe("splitDocumentByModule", () => {
  // A composed aggregate: two module-owned paths, one publicPath override owned
  // by `commerce`, and one route (`audit-log`) that no mount claims —
  // standing in for an `additionalRoutes` mount.
  const full = {
    openapi: "3.1.0",
    info: INFO,
    paths: {
      "/v1/admin/bookings/list": { get: {} },
      "/v1/public/booking-engine/hold": { post: {} },
      "/v1/admin/audit-log/{id}": { get: {} },
      "/v1/webhooks/netopia": { post: {} }, // non-surface — must be ignored
    },
    components: { schemas: {} },
  } satisfies OpenApiDocument

  const mounts: ModuleMount[] = [
    { moduleName: "bookings", prefix: "/v1/admin/bookings", load: () => docApp("/list") },
    { moduleName: "commerce", prefix: "/v1/public/booking-engine", load: () => docApp("/hold") },
  ]

  it("covers every admin/storefront path, attributing residual routes by segment", async () => {
    const docs = await splitDocumentByModule(full, mounts, { info: INFO })

    // publicPath override lands under its owning module, not the path segment.
    expect(Object.keys(docs.get("commerce")?.paths ?? {})).toEqual([
      "/v1/public/booking-engine/hold",
    ])
    // Unclaimed route falls back to its second path segment.
    expect(Object.keys(docs.get("audit-log")?.paths ?? {})).toEqual(["/v1/admin/audit-log/{id}"])
    expect(Object.keys(docs.get("bookings")?.paths ?? {})).toEqual(["/v1/admin/bookings/list"])

    // Every surface path is covered exactly once; non-surface routes are excluded.
    const covered = new Set<string>()
    for (const doc of docs.values()) for (const p of Object.keys(doc.paths ?? {})) covered.add(p)
    expect([...covered].sort()).toEqual([
      "/v1/admin/audit-log/{id}",
      "/v1/admin/bookings/list",
      "/v1/public/booking-engine/hold",
    ])
  })
})

describe("stampModuleMetadata", () => {
  const owner = new Map<string, string>([["/v1/public/booking-engine/hold", "commerce"]])
  const doc = {
    openapi: "3.1.0",
    info: INFO,
    paths: {
      "/v1/admin/bookings/list": { get: { responses: {} } },
      "/v1/public/booking-engine/hold": { post: { responses: {} } },
      "/v1/webhooks/netopia": { post: { responses: {} } },
    },
  } satisfies OpenApiDocument

  it("stamps x-voyant-module (authoritative owner) and x-voyant-surface per operation", () => {
    const stamped = stampModuleMetadata(doc, owner)
    const op = (path: string, method: string) =>
      (stamped.paths as Record<string, Record<string, Record<string, unknown>>>)[path][method]

    // Segment-derived module + admin surface + module tag (for Swagger grouping).
    expect(op("/v1/admin/bookings/list", "get")["x-voyant-module"]).toBe("bookings")
    expect(op("/v1/admin/bookings/list", "get")["x-voyant-surface"]).toBe("admin")
    expect(op("/v1/admin/bookings/list", "get").tags).toEqual(["bookings"])
    // Derived operationId (camelCase, `v1` dropped) + method+path summary.
    expect(op("/v1/admin/bookings/list", "get").operationId).toBe("getAdminBookingsList")
    expect(op("/v1/admin/bookings/list", "get").summary).toBe("GET /v1/admin/bookings/list")
    // publicPath override → authoritative owner, not the `booking-engine` prefix.
    expect(op("/v1/public/booking-engine/hold", "post")["x-voyant-module"]).toBe("commerce")
    expect(op("/v1/public/booking-engine/hold", "post")["x-voyant-surface"]).toBe("public-api")
    // Non-surface route: module stamped, surface omitted.
    expect(op("/v1/webhooks/netopia", "post")["x-voyant-module"]).toBe("webhooks")
    expect(op("/v1/webhooks/netopia", "post")["x-voyant-surface"]).toBeUndefined()
  })

  it("does not clobber tags / operationId / summary a route already declares", () => {
    const tagged = {
      openapi: "3.1.0",
      info: INFO,
      paths: {
        "/v1/admin/legal/contracts": {
          get: {
            tags: ["Legal"],
            operationId: "listContracts",
            summary: "List all contracts",
            responses: {},
          },
        },
      },
    } satisfies OpenApiDocument
    const stamped = stampModuleMetadata(tagged, new Map())
    const op = (stamped.paths as Record<string, Record<string, Record<string, unknown>>>)[
      "/v1/admin/legal/contracts"
    ].get
    expect(op.tags).toEqual(["Legal"])
    expect(op.operationId).toBe("listContracts")
    expect(op.summary).toBe("List all contracts")
    expect(op["x-voyant-module"]).toBe("legal")
  })

  it("keeps operationIds unique when a later route declares one an earlier op derives", () => {
    // `/v1/admin/items` GET derives `getAdminItems`; a later route hand-authors
    // that same id. Pre-seeding declared ids must push the derived one to a
    // suffix so the document has no duplicate operationIds.
    const collide = {
      openapi: "3.1.0",
      info: INFO,
      paths: {
        "/v1/admin/items": { get: { responses: {} } },
        "/v1/admin/things": { get: { operationId: "getAdminItems", responses: {} } },
      },
    } satisfies OpenApiDocument
    const stamped = stampModuleMetadata(collide, new Map())
    const get = (path: string) =>
      (stamped.paths as Record<string, Record<string, Record<string, unknown>>>)[path].get
    // Declared id wins; the earlier derived one yields to a suffix.
    expect(get("/v1/admin/things").operationId).toBe("getAdminItems")
    expect(get("/v1/admin/items").operationId).toBe("getAdminItems_2")
    expect(get("/v1/admin/items").operationId).not.toBe(get("/v1/admin/things").operationId)
  })

  it("does not mutate the input document", () => {
    const before = JSON.stringify(doc)
    stampModuleMetadata(doc, owner)
    expect(JSON.stringify(doc)).toBe(before)
  })
})
