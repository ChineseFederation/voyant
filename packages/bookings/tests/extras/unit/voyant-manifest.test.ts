import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  BOOKINGS_EXTRAS_OPENAPI_API_ID,
  bookingsExtrasRoutes,
  createBookingsExtrasVoyantRuntime,
} from "../../../src/extras.js"
import { bookingsExtrasVoyantModule } from "../../../src/voyant.js"

type OpenApiDocument = {
  paths?: Record<string, Record<string, Record<string, unknown>>>
}

const committedDocument = JSON.parse(
  readFileSync(new URL("../../../openapi/admin/booking-extras.json", import.meta.url), "utf8"),
) as OpenApiDocument

describe("bookings extras deployment manifest", () => {
  it("declares a package-owned module that depends on the main Bookings data owner", () => {
    expect(bookingsExtrasVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/bookings#extras",
      packageName: "@voyant-travel/bookings",
      localId: "bookings.extras",
      requires: { capabilities: ["bookings.data-owner"] },
      api: [
        {
          id: BOOKINGS_EXTRAS_OPENAPI_API_ID,
          surface: "admin",
          mount: "extras",
          openapi: { document: "booking-extras" },
          resource: "bookings",
          transactional: true,
          runtime: {
            entry: "@voyant-travel/bookings/extras",
            export: "createBookingsExtrasVoyantRuntime",
          },
        },
      ],
    })
    expect(bookingsExtrasVoyantModule.schema).toBeUndefined()
    expect(bookingsExtrasVoyantModule.migrations).toBeUndefined()
    expect(bookingsExtrasVoyantModule.actions).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/bookings#extras.action.create-booking-extra",
        targetLifecycle: "created",
        createdTarget: {
          commandTargetType: "booking-extra-create-command",
          resultReferenceType: "booking_extra",
          durability: "handler-command-claim-v1",
          parentAnchor: { targetType: "booking", targetIdField: "bookingId" },
        },
        risk: "high",
        reversible: false,
      }),
    )
    expect(
      bookingsExtrasVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/bookings#extras.action.update-booking-extra",
      ),
    ).toMatchObject({ commandTargetField: "id" })
  })

  it("uses its graph runtime factory to expose only the selected admin surface", async () => {
    const selected = await createBookingsExtrasVoyantRuntime(
      runtimeContext([{ id: BOOKINGS_EXTRAS_OPENAPI_API_ID, surface: "admin" }]),
    )
    const omitted = await createBookingsExtrasVoyantRuntime(runtimeContext([]))

    expect(selected.adminRoutes).toBeDefined()
    expect(new Set(readApiIds(openApiDocument(selected.adminRoutes)))).toEqual(
      new Set([BOOKINGS_EXTRAS_OPENAPI_API_ID]),
    )
    expect(omitted.adminRoutes).toBeUndefined()
  })

  it("keeps every live and committed operation under the extras graph API", () => {
    const liveDocument = openApiDocument(bookingsExtrasRoutes)
    const liveOperations = operations(liveDocument)
    const committedOperations = operations(committedDocument)

    expect(liveOperations).toHaveLength(9)
    expect(committedOperations).toHaveLength(9)
    expect(new Set(liveOperations.map(({ apiId }) => apiId))).toEqual(
      new Set([BOOKINGS_EXTRAS_OPENAPI_API_ID]),
    )
    expect(new Set(committedOperations.map(({ apiId }) => apiId))).toEqual(
      new Set([BOOKINGS_EXTRAS_OPENAPI_API_ID]),
    )
    expect(committedOperations.map(({ method, path }) => `${method} ${path}`)).toEqual(
      liveOperations.map(({ method, path }) => `${method} /v1/admin/extras${path}`),
    )
  })
})

function runtimeContext(api: readonly { id: string; surface: "admin" }[]) {
  return {
    unitId: "@voyant-travel/bookings#extras",
    projectConfig: {},
    getUnitProjectConfig: () => undefined,
    hostOptions: {},
    api,
    graph: {
      providerSelections: {},
      accessCatalog: { resources: [], presets: [] },
      references: [],
      setupSteps: [],
      tools: [],
    },
    runtimePorts: {},
    hasPort: () => false,
    getPort: async <TProvider>() => undefined as TProvider,
    getPorts: async <TProvider>() => [] as TProvider[],
  }
}

function openApiDocument(routes: unknown): OpenApiDocument {
  return (
    routes as {
      getOpenAPI31Document(input: {
        openapi: "3.1.0"
        info: { title: string; version: string }
      }): OpenApiDocument
    }
  ).getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Bookings extras", version: "1" },
  })
}

function operations(document: OpenApiDocument) {
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).map(([method, operation]) => ({
      path,
      method: method.toUpperCase(),
      apiId: operation["x-voyant-api-id"],
    })),
  )
}

function readApiIds(document: OpenApiDocument) {
  return operations(document).map(({ apiId }) => apiId)
}
