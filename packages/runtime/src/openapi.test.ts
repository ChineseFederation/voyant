import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { VoyantGraphRuntime, VoyantGraphRuntimeUnitLoader } from "@voyant-travel/framework"
import type { LazyMount, ModuleMount } from "@voyant-travel/hono/openapi"
import { describe, expect, it } from "vitest"

import { buildOperatorOpenApiDocuments } from "./openapi.js"

async function loadFixtureModule<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): Promise<T> {
  const moduleNamespace: Record<string, unknown> = { fixtureModule: {} }
  return moduleNamespace as T
}

function documentedApp() {
  const app = new OpenAPIHono() as OpenAPIHono & {
    lazyMounts: LazyMount[]
    moduleMounts: ModuleMount[]
  }
  app.lazyMounts = []
  app.moduleMounts = []

  for (const path of ["/v1/admin/identity/contacts", "/v1/public/trips"]) {
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

function selectedRuntime(): Pick<VoyantGraphRuntime, "modules" | "extensions" | "plugins"> {
  const unit = (
    id: string,
    surface: "admin" | "public",
    mount: string,
    document: string,
  ): VoyantGraphRuntimeUnitLoader => {
    const referenceId = `${id}#api.${surface}:runtime`
    const runtime = { entry: id, export: "fixtureModule" } as const
    const route = {
      id: `${id}#api.${surface}`,
      surface,
      mount,
      openapi: { document },
      runtime,
    } as const
    return {
      id,
      localId: id.split("/").at(-1),
      kind: "module",
      packageName: id.split("#")[0]!,
      order: 0,
      projectConfig: {},
      references: [
        {
          id: referenceId,
          unitId: id,
          facet: "api",
          entityId: route.id,
          runtime,
          importEntry: id,
          load: async <T = unknown>() => ({}) as T,
          loadModule: loadFixtureModule,
        },
      ],
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
        routes: [route.id],
        tools: [],
        events: [],
        webhooks: [],
      },
      routes: [{ route, importEntry: id, referenceId, load: async () => ({}) }],
      load: async () => [],
    }
  }

  return {
    modules: [
      unit("@fixture/identity", "admin", "identity", "identity"),
      unit("@fixture/trips", "public", "trips", "trips"),
    ],
    extensions: [],
    plugins: [],
  }
}

describe("buildOperatorOpenApiDocuments", () => {
  it("assembles and partitions only selected graph documents", async () => {
    const docs = await buildOperatorOpenApiDocuments({
      runtime: selectedRuntime(),
      app: documentedApp(),
    })

    expect([...docs.modules.keys()]).toEqual(["identity", "trips"])
    expect(Object.keys(docs.full.paths ?? {})).toEqual([
      "/v1/admin/identity/contacts",
      "/v1/public/trips",
    ])
    expect(Object.keys(docs.admin.paths ?? {})).toEqual(["/v1/admin/identity/contacts"])
    expect(Object.keys(docs["public-api"].paths ?? {})).toEqual(["/v1/public/trips"])
    expect(docs.full.info.title).toBe("Voyant Operator API")
  })

  it("accepts deployment-specific document metadata", async () => {
    const docs = await buildOperatorOpenApiDocuments({
      runtime: selectedRuntime(),
      app: documentedApp(),
      options: { info: { title: "Acme Operator API", version: "1" } },
    })

    expect(docs.full.info).toMatchObject({ title: "Acme Operator API", version: "1" })
  })
})
