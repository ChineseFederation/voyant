import { describe, expect, it } from "vitest"
import {
  MICE_BOOKING_OPENAPI_API_ID,
  miceBookingExtension,
  miceBookingExtensionRoutes,
} from "../../src/booking-extension.js"
import { createMiceApiModule } from "../../src/index.js"
import { miceBookingVoyantPlugin, miceVoyantModule } from "../../src/voyant.js"

describe("MICE deployment manifests", () => {
  it("owns the module runtime, persistence, and link facets", () => {
    expect(miceVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/mice",
      packageName: "@voyant-travel/mice",
      provides: { ports: [{ id: "mice.runtime" }] },
      api: [
        {
          id: "@voyant-travel/mice#api.admin",
          surface: "admin",
          mount: "mice",
          openapi: { document: "mice" },
          transactional: true,
          runtime: { entry: "@voyant-travel/mice", export: "createMiceVoyantRuntime" },
        },
      ],
      schema: [{ id: "@voyant-travel/mice#schema" }],
      migrations: [{ id: "@voyant-travel/mice#migrations" }],
      admin: {
        runtime: {
          entry: "@voyant-travel/mice-react/admin",
          export: "createSelectedMiceAdminExtension",
        },
        routes: [
          {
            id: "@voyant-travel/mice#admin.route.programs-index",
            path: "/mice",
            requiredScopes: ["mice:read"],
          },
          {
            id: "@voyant-travel/mice#admin.route.programs-detail",
            path: "/mice/$id",
            requiredScopes: ["mice:read"],
          },
        ],
        nav: [
          {
            id: "@voyant-travel/mice#admin.nav.programs",
            routeId: "@voyant-travel/mice#admin.route.programs-index",
            label: { namespace: "operator.admin.navigation", key: "nav.mice" },
          },
        ],
      },
      links: [
        { id: "@voyant-travel/mice#linkable.program" },
        { id: "@voyant-travel/mice#linkable.session" },
        { id: "@voyant-travel/mice#linkable.delegate" },
        { id: "@voyant-travel/mice#linkable.roomingAssignment" },
        { id: "@voyant-travel/mice#linkable.rfp" },
        { id: "@voyant-travel/mice#linkable.bid" },
        { id: "@voyant-travel/mice#link.bid-supplier" },
        { id: "@voyant-travel/mice#link.delegate-booking" },
        { id: "@voyant-travel/mice#link.delegate-person" },
        { id: "@voyant-travel/mice#link.organization-program" },
        { id: "@voyant-travel/mice#link.program-space-block" },
        { id: "@voyant-travel/mice#link.rooming-room-block" },
        { id: "@voyant-travel/mice#link.session-function-space" },
      ],
    })
    expect(
      miceVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/mice#action.update-program",
      ),
    ).toMatchObject({ commandTargetField: "id" })
  })

  it("owns the booking extension", () => {
    expect(miceBookingVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/mice#booking-extension",
      packageName: "@voyant-travel/mice",
      api: [
        {
          id: "@voyant-travel/mice#booking-extension.api.admin",
          surface: "admin",
          mount: "bookings",
          openapi: { document: "mice-booking" },
          runtime: {
            entry: "@voyant-travel/mice/booking-extension",
            export: "miceBookingExtension",
          },
        },
      ],
    })

    expect(readApiIds(miceBookingExtensionRoutes)).toEqual(
      Array.from({ length: 3 }, () => MICE_BOOKING_OPENAPI_API_ID),
    )
  })

  it("describes MICE API access and requires the database schema directly", async () => {
    expect(miceVoyantModule.access?.resources).toEqual([
      expect.objectContaining({
        resource: "mice",
        label: "MICE programs",
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

    const packageJson = await import("../../package.json", { with: { type: "json" } })
    expect(packageJson.default.voyant.requiresSchemas).toContain("@voyant-travel/db")
  })

  it("references exported runtimes with matching mounts", () => {
    expect(createMiceApiModule().module.name).toBe("mice")
    expect(miceBookingExtension.extension.module).toBe("bookings")
  })

  it("declares the emitted awarded RFP payload", () => {
    expect(miceVoyantModule.events?.[0]?.payloadSchema).toEqual({
      type: "object",
      properties: {
        rfpId: { type: "string" },
        programId: { type: "string" },
        bidId: { type: "string" },
        supplierId: { type: "string" },
        actorId: { type: ["string", "null"] },
        awardedAt: { type: "string", format: "date-time" },
      },
      required: ["rfpId", "programId", "bidId", "supplierId", "actorId", "awardedAt"],
      additionalProperties: false,
    })
  })
})

function readApiIds(routes: OpenApiDocumentSource): unknown[] {
  const document = routes.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "MICE booking extension", version: "1" },
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
