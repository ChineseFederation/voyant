import { isGraphRuntimeFactory } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"
import {
  CHARTERS_BOOKING_OPENAPI_API_ID,
  chartersBookingExtensionRoutes,
} from "../../src/booking-extension.js"
import { createChartersApiModule, createChartersVoyantRuntime } from "../../src/index.js"
import { CHARTERS_PUBLIC_OPENAPI_API_ID } from "../../src/routes-openapi.js"
import { chartersPublicRoutes } from "../../src/routes-public.js"
import { chartersBookingVoyantPlugin, chartersVoyantModule } from "../../src/voyant.js"

describe("charters deployment manifest", () => {
  it("owns its transactional operator and anonymous storefront surfaces", () => {
    expect(chartersVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/charters",
      packageName: "@voyant-travel/charters",
      provides: { ports: [{ id: "catalog.extension.charters" }] },
      api: [
        {
          surface: "admin",
          mount: "charters",
          transactional: true,
          openapi: { document: "charters" },
          runtime: { export: "createChartersVoyantRuntime" },
        },
        {
          surface: "public",
          mount: "charters",
          anonymous: true,
          transactional: true,
          openapi: { document: "charters" },
          runtime: { export: "createChartersVoyantRuntime" },
        },
      ],
      schema: [{ id: "@voyant-travel/charters#schema", source: "@voyant-travel/charters/schema" }],
      migrations: [{ id: "@voyant-travel/charters#migrations", source: "./migrations" }],
      links: [
        { id: "@voyant-travel/charters#linkable.charter_product" },
        { id: "@voyant-travel/charters#linkable.charter_voyage" },
        { id: "@voyant-travel/charters#linkable.charter_yacht" },
      ],
    })
    expect(isGraphRuntimeFactory(createChartersVoyantRuntime)).toBe(true)
    expect(readApiIds(chartersPublicRoutes)).toEqual(
      Array.from({ length: 7 }, () => CHARTERS_PUBLIC_OPENAPI_API_ID),
    )
  })

  it("owns the bookings extension and preserves injected lazy bridges", () => {
    expect(chartersBookingVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/charters#booking-extension",
      api: [
        {
          surface: "admin",
          mount: "bookings",
          openapi: { document: "bookings" },
          runtime: { export: "chartersBookingExtension" },
        },
      ],
    })

    const lazyAdminRoutes = async () => ({}) as never
    const lazyPublicRoutes = async () => ({}) as never
    const module = createChartersApiModule({ lazyAdminRoutes, lazyPublicRoutes, anonymous: true })
    expect(module).toMatchObject({ lazyAdminRoutes, lazyPublicRoutes, anonymous: true })
    expect(module.adminRoutes).toBeUndefined()
    expect(module.publicRoutes).toBeUndefined()

    expect(readApiIds(chartersBookingExtensionRoutes)).toEqual([
      CHARTERS_BOOKING_OPENAPI_API_ID,
      CHARTERS_BOOKING_OPENAPI_API_ID,
      CHARTERS_BOOKING_OPENAPI_API_ID,
      CHARTERS_BOOKING_OPENAPI_API_ID,
      CHARTERS_BOOKING_OPENAPI_API_ID,
    ])
  })

  it("describes access for every charter API method", () => {
    expect(chartersVoyantModule.access?.resources).toEqual([
      expect.objectContaining({
        resource: "charters",
        label: "Charters",
        description: expect.any(String),
        actions: [
          expect.objectContaining({
            action: "read",
            label: expect.any(String),
            description: expect.any(String),
          }),
          expect.objectContaining({
            action: "write",
            label: expect.any(String),
            description: expect.any(String),
          }),
          expect.objectContaining({
            action: "delete",
            label: expect.any(String),
            description: expect.any(String),
            sensitive: true,
          }),
        ],
      }),
    ])
  })

  it("declares exact ledger and approval policy for Tool actions", () => {
    expect(chartersVoyantModule.tools).toHaveLength(13)
    expect(chartersVoyantModule.actions).toHaveLength(13)
    const booking = chartersVoyantModule.actions?.find((action) =>
      action.from?.tools?.includes("@voyant-travel/charters#tool.create-charter-booking"),
    )
    expect(booking).toMatchObject({
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      requiredScopes: ["charters:write", "bookings:write"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
    })
    for (const action of chartersVoyantModule.actions?.filter(
      ({ kind, risk }) => kind === "execute" && risk === "medium",
    ) ?? []) {
      expect(action).toMatchObject({
        ledger: "required",
        approval: "never",
        allowedActorTypes: ["staff"],
      })
      expect(action.reversible).toBe(action.targetLifecycle !== "created")
    }
    for (const id of ["update-charter-product", "update-charter-voyage", "update-charter-yacht"]) {
      expect(
        chartersVoyantModule.actions?.find(
          ({ id: actionId }) => actionId === `@voyant-travel/charters#action.${id}`,
        ),
      ).toMatchObject({ commandTargetField: "id" })
    }
  })
})

function readApiIds(routes: OpenApiDocumentSource): unknown[] {
  const document = routes.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Charter booking extension", version: "1" },
  })
  return Object.values(document.paths ?? {}).flatMap((path) =>
    Object.values(path).map((operation) => operation["x-voyant-api-id"]),
  )
}

interface OpenApiDocumentSource {
  getOpenAPI31Document(input: { openapi: "3.1.0"; info: { title: string; version: string } }): {
    paths?: Record<string, Record<string, Record<string, unknown>>>
  }
}
