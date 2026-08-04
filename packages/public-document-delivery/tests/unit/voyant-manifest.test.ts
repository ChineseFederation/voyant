import { storageObjectRuntimePort } from "@voyant-travel/storage/runtime-port"
import { describe, expect, it } from "vitest"
import {
  createPublicDocumentDeliveryApiModule,
  createPublicDocumentDeliveryVoyantRuntime,
  PUBLIC_DOCUMENT_DELIVERY_OPENAPI_API_ID,
} from "../../src/index.js"
import { publicDocumentDeliveryVoyantModule } from "../../src/voyant.js"

describe("public document delivery deployment manifest", () => {
  it("owns the anonymous public route and references a real package export", () => {
    expect(publicDocumentDeliveryVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/public-document-delivery",
      packageName: "@voyant-travel/public-document-delivery",
      requires: { ports: [{ id: "database.client" }, { id: "storage.object" }] },
      runtimePorts: [{ id: "storage.object" }],
      api: [
        {
          id: "@voyant-travel/public-document-delivery#api.public",
          surface: "public",
          mount: "documents",
          anonymous: true,
          openapi: { document: "public-document-delivery" },
          runtime: {
            entry: "@voyant-travel/public-document-delivery",
            export: "createPublicDocumentDeliveryVoyantRuntime",
          },
        },
      ],
      resources: [
        { id: "@voyant-travel/public-document-delivery#resource.database", kind: "database" },
        {
          id: "@voyant-travel/public-document-delivery#resource.documents",
          kind: "object-storage",
        },
      ],
      lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
    })
    expect(createPublicDocumentDeliveryApiModule().module.name).toBe("documents")
  })

  it("consumes the selected storage.object resolver through its graph runtime factory", async () => {
    let requestedPort: unknown
    const storageResolver = { resolve: () => null }
    const runtime = await createPublicDocumentDeliveryVoyantRuntime({
      unitId: "@voyant-travel/public-document-delivery",
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      hostOptions: {},
      api: [{ id: PUBLIC_DOCUMENT_DELIVERY_OPENAPI_API_ID, surface: "public" }],
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: { [storageObjectRuntimePort.id]: storageResolver },
      hasPort: () => true,
      async getPort<TProvider>(port) {
        requestedPort = port
        return storageResolver as TProvider
      },
      getPorts: async <TProvider>() => [] as TProvider[],
    })

    expect(requestedPort).toBe(storageObjectRuntimePort)
    expect(runtime.module.name).toBe("documents")
    expect(runtime.publicRoutes).toBeDefined()
  })

  it("publishes its anonymous route from a package-owned OpenAPI registry", () => {
    const routes = createPublicDocumentDeliveryApiModule().publicRoutes as OpenApiDocumentSource
    const document = routes.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "Public documents", version: "1" },
    })

    expect(
      (document.paths?.["/{token}"]?.get as Record<string, unknown> | undefined)?.[
        "x-voyant-api-id"
      ],
    ).toBe(PUBLIC_DOCUMENT_DELIVERY_OPENAPI_API_ID)
  })
})

interface OpenApiDocumentSource {
  getOpenAPI31Document(input: { openapi: "3.1.0"; info: { title: string; version: string } }): {
    paths?: Record<string, Record<string, unknown>>
  }
}
