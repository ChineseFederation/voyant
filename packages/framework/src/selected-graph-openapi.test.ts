import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { VoyantGraphRouteBundle } from "@voyant-travel/core/project"
import type { LazyMount, ModuleMount } from "@voyant-travel/hono/openapi"
import { describe, expect, it } from "vitest"

import type { VoyantGraphRuntime, VoyantGraphRuntimeUnitLoader } from "./runtime-lowering.js"
import {
  buildSelectedGraphOpenApiDocuments,
  mergeSelectedGraphOpenApiDocuments,
} from "./selected-graph-openapi.js"

const options = { info: { title: "Selected graph", version: "1" } }

function documentedApp(paths: readonly string[]) {
  const app = new OpenAPIHono() as OpenAPIHono & {
    lazyMounts: LazyMount[]
    moduleMounts: ModuleMount[]
  }
  app.lazyMounts = []
  app.moduleMounts = []
  for (const path of paths) {
    app.openapi(
      createRoute({
        method: "get",
        path,
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "OK",
          },
        },
      }),
      (context) => context.json({ ok: true }),
    )
  }
  return app
}

function methodSplitApp(path: string) {
  const app = documentedApp([])
  for (const method of ["get", "post"] as const) {
    app.openapi(
      createRoute({
        method,
        path,
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "OK",
          },
        },
      }),
      (context) => context.json({ ok: true }),
    )
  }
  return app
}

function unit(
  id: string,
  routes: readonly VoyantGraphRouteBundle[],
  kind: "module" | "extension" | "plugin" = "module",
): VoyantGraphRuntimeUnitLoader {
  return {
    id,
    localId: id.split("/").at(-1)?.split("#").at(-1),
    kind,
    packageName: id.split("#")[0]!,
    order: 0,
    projectConfig: {},
    references: [],
    config: [],
    secrets: [],
    resources: [],
    providers: [],
    requiredPorts: [],
    runtimePorts: [],
    manyRuntimePorts: [],
    requiredRuntimePorts: [],
    accessScopes: [],
    tools: [],
    jobs: [],
    actions: [],
    selectedIds: {
      routes: routes.map(({ id }) => id),
      tools: [],
      events: [],
      webhooks: [],
    },
    routes: routes.map((route) => ({
      unitId: id,
      route,
      importEntry: route.runtime?.entry ?? id,
      referenceId: `${route.id}:runtime`,
      load: async () => ({}),
    })),
    load: async () => [],
  }
}

function runtime(
  modules: readonly VoyantGraphRuntimeUnitLoader[],
  extensions: readonly VoyantGraphRuntimeUnitLoader[] = [],
  plugins: readonly VoyantGraphRuntimeUnitLoader[] = [],
): Pick<VoyantGraphRuntime, "modules" | "extensions" | "plugins"> {
  return { modules, extensions, plugins }
}

function route(
  id: string,
  mount: string,
  document?: string,
  methods?: VoyantGraphRouteBundle["methods"],
): VoyantGraphRouteBundle {
  return {
    id,
    surface: "admin",
    mount,
    ...(document ? { openapi: { document } } : {}),
    ...(methods ? { methods } : {}),
    runtime: { entry: id },
  }
}

describe("buildSelectedGraphOpenApiDocuments", () => {
  it("follows graph selection and rejects unclaimed published paths", async () => {
    const app = documentedApp(["/v1/admin/identity/contacts"])
    const identity = unit("@voyant-travel/identity", [
      route("@voyant-travel/identity#api.admin", "identity", "identity"),
    ])

    const selected = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([identity]),
      app,
      options,
    })

    expect([...selected.keys()]).toEqual(["identity"])
    expect(Object.keys(selected.get("identity")?.paths ?? {})).toEqual([
      "/v1/admin/identity/contacts",
    ])
    await expect(
      buildSelectedGraphOpenApiDocuments({
        runtime: runtime([]),
        app: documentedApp(["/v1/admin/identity/contacts", "/v1/admin/bookings"]),
        options,
      }),
    ).rejects.toThrow(/unclaimed published operations.*GET \/v1\/admin\/identity\/contacts/)
  })

  it("normalizes relative mounts and replays lazy route registries", async () => {
    const app = documentedApp([])
    const lazy = documentedApp(["/addresses"])
    app.lazyMounts.push({ prefix: "/v1/admin/identity", load: async () => lazy })
    app.moduleMounts.push({
      moduleName: "identity",
      prefix: "/v1/admin/identity",
      load: async () => lazy,
    })
    const identity = unit("@voyant-travel/identity", [
      route("@voyant-travel/identity#api.admin", "identity", "identity", ["GET"]),
    ])

    const documents = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([identity]),
      app,
      options,
    })
    const operation = documents.get("identity")?.paths?.["/v1/admin/identity/addresses"]
      ?.get as Record<string, unknown>

    expect(operation).toMatchObject({
      operationId: "getAdminIdentityAddresses",
      "x-voyant-api-id": "@voyant-travel/identity#api.admin",
      "x-voyant-unit-id": "@voyant-travel/identity",
      "x-voyant-package-name": "@voyant-travel/identity",
    })
  })

  it("fails an opted-in bundle that owns no documented operations", async () => {
    const app = documentedApp(["/v1/admin/bookings"])
    const identity = unit("@voyant-travel/identity", [
      route("@voyant-travel/identity#api.admin", "identity", "identity"),
    ])

    await expect(
      buildSelectedGraphOpenApiDocuments({ runtime: runtime([identity]), app, options }),
    ).rejects.toThrow(/matched zero operations/)
  })

  it("merges disjoint selected bundles into one package-owned document", async () => {
    const app = documentedApp(["/v1/admin/identity", "/v1/admin/identity-extra"])
    const module = unit("@voyant-travel/identity", [
      route("@voyant-travel/identity#api.admin", "identity", "identity"),
    ])
    const extension = unit(
      "@acme/identity-extension",
      [route("@acme/identity-extension#api.admin", "identity-extra", "identity")],
      "extension",
    )

    const documents = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([module], [extension]),
      app,
      options,
    })

    expect(Object.keys(documents.get("identity")?.paths ?? {})).toEqual([
      "/v1/admin/identity-extra",
      "/v1/admin/identity",
    ])
  })

  it("fails overlapping mounts that claim the same path", async () => {
    const app = documentedApp(["/v1/admin/identity/contacts"])
    const identity = unit("@voyant-travel/identity", [
      route("@voyant-travel/identity#api.admin", "identity", "identity"),
      route("@voyant-travel/identity#api.contacts", "identity/contacts", "identity-contacts"),
    ])

    await expect(
      buildSelectedGraphOpenApiDocuments({ runtime: runtime([identity]), app, options }),
    ).rejects.toThrow(/path "\/v1\/admin\/identity\/contacts" method "GET" is claimed by both/)
  })

  it("prefers exact operation API ids when route mount prefixes overlap", async () => {
    const uploadsApiId = "@voyant-travel/storage#api.admin.uploads"
    const videoApiId = "@voyant-travel/storage#api.admin.video-upload-ticket"
    const uploadsPath = "/v1/admin/uploads"
    const videoPath = "/v1/admin/uploads/video"
    const app = documentedApp([])

    for (const [path, apiId] of [
      [uploadsPath, uploadsApiId],
      [videoPath, videoApiId],
    ] as const) {
      app.openapi(
        createRoute({
          method: "post",
          path,
          responses: {
            200: {
              content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
              description: "OK",
            },
          },
          "x-voyant-api-id": apiId,
        }),
        (context) => context.json({ ok: true }),
      )
    }

    const storage = unit("@voyant-travel/storage", [
      route(uploadsApiId, "uploads", "storage-uploads", ["POST"]),
      route(videoApiId, "uploads/video", "storage-video-upload-ticket", ["POST"]),
    ])
    const documents = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([storage]),
      app,
      options,
    })

    expect(Object.keys(documents.get("storage-uploads")?.paths ?? {})).toEqual([uploadsPath])
    expect(Object.keys(documents.get("storage-video-upload-ticket")?.paths ?? {})).toEqual([
      videoPath,
    ])

    for (const [path, apiId] of [
      [uploadsPath, uploadsApiId],
      [videoPath, videoApiId],
    ] as const) {
      const owners = [...documents.values()].flatMap((document) => {
        const operation = document.paths?.[path]?.post as Record<string, unknown> | undefined
        return operation ? [operation["x-voyant-api-id"]] : []
      })
      expect(owners).toEqual([apiId])
    }
  })

  it("allows separate bundles to claim different methods on the same path", async () => {
    const path = "/v1/admin/identity/contacts"
    const app = methodSplitApp(path)
    const identity = unit("@voyant-travel/identity", [
      route("@voyant-travel/identity#api.contacts.read", "identity", "identity-read", ["GET"]),
      route("@voyant-travel/identity#api.contacts.write", "identity", "identity-write", ["POST"]),
    ])

    const documents = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([identity]),
      app,
      options,
    })

    expect(Object.keys(documents.get("identity-read")?.paths?.[path] ?? {})).toEqual(["get"])
    expect(Object.keys(documents.get("identity-write")?.paths?.[path] ?? {})).toEqual(["post"])
  })

  it("merges selected documents into one aggregate without duplicate operations", async () => {
    const path = "/v1/admin/identity/contacts"
    const app = methodSplitApp(path)
    const identity = unit("@voyant-travel/identity", [
      route("@voyant-travel/identity#api.contacts.read", "identity", "identity-read", ["GET"]),
      route("@voyant-travel/identity#api.contacts.write", "identity", "identity-write", ["POST"]),
    ])
    const documents = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([identity]),
      app,
      options,
    })

    expect(Object.keys(mergeSelectedGraphOpenApiDocuments(documents).paths?.[path] ?? {})).toEqual([
      "get",
      "post",
    ])
    expect(() =>
      mergeSelectedGraphOpenApiDocuments(
        new Map([
          ["first", documents.get("identity-read")!],
          ["second", documents.get("identity-read")!],
        ]),
      ),
    ).toThrow(/emitted by both/)
  })

  it("requires exact operation ownership for root-mounted bundles", async () => {
    const apiId = "@voyant-travel/public-api#api.public"
    const ownedPath = "/v1/public/storefront"
    const unrelatedPath = "/v1/public/bookings"
    const app = documentedApp([unrelatedPath])
    app.openapi(
      createRoute({
        method: "get",
        path: ownedPath,
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "OK",
          },
        },
        "x-voyant-api-id": apiId,
      }),
      (context) => context.json({ ok: true }),
    )
    const storefront = unit("@voyant-travel/public-api", [route(apiId, "/", "storefront", ["GET"])])

    await expect(
      buildSelectedGraphOpenApiDocuments({ runtime: runtime([storefront]), app, options }),
    ).rejects.toThrow(/unclaimed published operations.*GET \/v1\/public\/bookings/)

    const ownedApp = documentedApp([])
    ownedApp.openapi(
      createRoute({
        method: "get",
        path: ownedPath,
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "OK",
          },
        },
        "x-voyant-api-id": apiId,
      }),
      (context) => context.json({ ok: true }),
    )
    const documents = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([storefront]),
      app: ownedApp,
      options,
    })

    expect(Object.keys(documents.get("storefront")?.paths ?? {})).toEqual([ownedPath])
    expect(documents.get("storefront")?.paths?.[unrelatedPath]).toBeUndefined()
  })

  it("stamps the key kind from the same declaration the runtime enforces", async () => {
    // voyant#4625 §1: the served document and the capability middleware read one
    // declaration. Hand-stamping the specs instead would let a contract promise
    // a reach the deployment 403s.
    const app = documentedApp([
      "/v1/public/storefront/departures",
      "/v1/public/storefront/leads",
      "/v1/public/storefront/exports",
      "/v1/admin/storefront/offers",
    ])
    const storefront = unit("@voyant-travel/public-api", [
      {
        id: "@voyant-travel/public-api#api.public",
        surface: "public",
        mount: "storefront",
        openapi: { document: "storefront" },
        publishable: ["/departures"],
        guardedIntake: ["/leads"],
        runtime: { entry: "@voyant-travel/public-api" },
      },
      {
        id: "@voyant-travel/public-api#api.admin",
        surface: "admin",
        mount: "storefront",
        openapi: { document: "storefront" },
        // An admin bundle cannot make a path publishable, however it declares.
        publishable: true,
        runtime: { entry: "@voyant-travel/public-api" },
      },
    ])

    const documents = await buildSelectedGraphOpenApiDocuments({
      runtime: runtime([storefront]),
      app,
      options,
    })
    const paths = documents.get("storefront")?.paths ?? {}
    const kindOf = (routePath: string) =>
      (paths[routePath]?.get as Record<string, unknown> | undefined)?.["x-voyant-key-kind"]

    expect(kindOf("/v1/public/storefront/departures")).toBe("publishable")
    // Unchallenged intake publishes as secret: whether a publishable key reaches
    // it depends on a deployment fact no document can know.
    expect(kindOf("/v1/public/storefront/leads")).toBe("secret")
    // Undeclared is secret — the fail-closed default, stated rather than blank.
    expect(kindOf("/v1/public/storefront/exports")).toBe("secret")
    expect(kindOf("/v1/admin/storefront/offers")).toBe("secret")
  })
})
