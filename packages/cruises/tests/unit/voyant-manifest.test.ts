import { assertPortConforms, isGraphRuntimeFactory } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"
import {
  CRUISES_BOOKING_OPENAPI_API_ID,
  cruisesBookingExtensionRoutes,
} from "../../src/booking-extension.js"
import { createCruisesContentVoyantRuntime } from "../../src/graph-runtime.js"
import { createCruisesApiModule, createCruisesVoyantRuntime } from "../../src/index.js"
import { cruiseAdminRoutes } from "../../src/routes.js"
import {
  CRUISE_CONTENT_OPENAPI_API_IDS,
  createCruiseContentApiExtension,
} from "../../src/routes-content.js"
import { CRUISES_OPENAPI_API_IDS } from "../../src/routes-openapi.js"
import { cruisePublicRoutes } from "../../src/routes-public.js"
import { cruisesRoutesRuntimePort } from "../../src/runtime-port.js"
import {
  cruisesBookingVoyantPlugin,
  cruisesContentVoyantPlugin,
  cruisesVoyantModule,
} from "../../src/voyant.js"

describe("cruises deployment manifest", () => {
  it("owns its transactional operator and anonymous storefront surfaces", () => {
    expect(cruisesVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/cruises",
      packageName: "@voyant-travel/cruises",
      provides: {
        ports: [
          { id: "catalog.extension.cruises" },
          { id: "finance.cruises-payment-policy.runtime" },
          { id: "cruises.external-refresh-job" },
        ],
      },
      requires: { ports: [{ id: "catalog.runtime-services" }] },
      api: [
        {
          surface: "admin",
          mount: "cruises",
          transactional: true,
          openapi: { document: "cruises" },
          runtime: { export: "createCruisesVoyantRuntime" },
        },
        {
          surface: "public",
          mount: "cruises",
          anonymous: true,
          transactional: true,
          openapi: { document: "cruises" },
          runtime: { export: "createCruisesVoyantRuntime" },
        },
      ],
      runtimePorts: [{ id: "cruises.routes-runtime" }, { id: "cruises.external-refresh-job" }],
      schema: [{ id: "@voyant-travel/cruises#schema", source: "@voyant-travel/cruises/schema" }],
      migrations: [{ id: "@voyant-travel/cruises#migrations", source: "./migrations" }],
      links: [
        { id: "@voyant-travel/cruises#linkable.cruise" },
        { id: "@voyant-travel/cruises#linkable.cruise_voyage_group" },
        { id: "@voyant-travel/cruises#linkable.cruise_sailing" },
        { id: "@voyant-travel/cruises#linkable.cruise_ship" },
      ],
      jobs: [
        expect.objectContaining({
          id: "cruises.external-catalog-refresh",
          schedule: { cron: "30 3 * * *", overlap: "skip" },
          runtime: {
            entry: "@voyant-travel/cruises/external-refresh-job",
            export: "runCruisesExternalCatalogRefreshJob",
          },
        }),
      ],
    })
    expect(isGraphRuntimeFactory(createCruisesVoyantRuntime)).toBe(true)
    expect(new Set(readApiIds(cruiseAdminRoutes))).toEqual(new Set([CRUISES_OPENAPI_API_IDS.admin]))
    expect(new Set(readApiIds(cruisePublicRoutes))).toEqual(
      new Set([CRUISES_OPENAPI_API_IDS.public]),
    )
  })

  it("validates the deployment registry contract", async () => {
    await expect(
      assertPortConforms(cruisesRoutesRuntimePort, {
        resolveSourceAdapterRegistry: async () => ({}) as never,
      }),
    ).resolves.toBeUndefined()
    await expect(assertPortConforms(cruisesRoutesRuntimePort, {} as never)).rejects.toThrow(
      /resolveSourceAdapterRegistry/,
    )
  })

  it("owns content and booking extensions", () => {
    expect(cruisesContentVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/cruises#content-extension",
      api: [
        {
          surface: "admin",
          mount: "cruises",
          openapi: { document: "cruises" },
          runtime: { export: "createCruisesContentVoyantRuntime" },
        },
        {
          surface: "public",
          mount: "cruises",
          anonymous: true,
          openapi: { document: "cruises" },
          runtime: { export: "createCruisesContentVoyantRuntime" },
        },
      ],
      runtimePorts: [{ id: "catalog.content-runtime" }],
    })
    expect(cruisesBookingVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/cruises#booking-extension",
      api: [
        {
          surface: "admin",
          mount: "bookings",
          openapi: { document: "bookings" },
          runtime: { export: "cruisesBookingExtension" },
        },
      ],
    })

    const resolveRegistry = () => ({}) as never
    const extension = createCruiseContentApiExtension({
      admin: { resolveRegistry, defaultAcceptMachineTranslated: false, allowOwnedKeys: true },
      public: { resolveRegistry, defaultAcceptMachineTranslated: true, allowOwnedKeys: true },
    })
    expect(extension.extension).toMatchObject({ name: "content", module: "cruises" })
    expect(extension.adminRoutes).toBeDefined()
    expect(extension.publicRoutes).toBeDefined()
    expect(isGraphRuntimeFactory(createCruisesContentVoyantRuntime)).toBe(true)
    expect(new Set(readApiIds(extension.adminRoutes as OpenApiDocumentSource))).toEqual(
      new Set([CRUISE_CONTENT_OPENAPI_API_IDS.admin]),
    )
    expect(new Set(readApiIds(extension.publicRoutes as OpenApiDocumentSource))).toEqual(
      new Set([CRUISE_CONTENT_OPENAPI_API_IDS.public]),
    )
    expect(readApiIds(cruisesBookingExtensionRoutes)).toEqual(
      Array.from({ length: 6 }, () => CRUISES_BOOKING_OPENAPI_API_ID),
    )
  })

  it("describes read, write, and privileged delete access", () => {
    expect(cruisesVoyantModule.access?.resources).toEqual([
      expect.objectContaining({
        resource: "cruises",
        label: "Cruises",
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
    expect(cruisesVoyantModule.tools).toHaveLength(12)
    expect(cruisesVoyantModule.actions).toHaveLength(12)
    const booking = cruisesVoyantModule.actions?.find((action) =>
      action.from?.tools?.includes("@voyant-travel/cruises#tool.create-cruise-booking"),
    )
    expect(booking).toMatchObject({
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      requiredScopes: ["cruises:write", "bookings:write"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
    })
    expect(
      cruisesVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/cruises#action.create-cruise",
      ),
    ).toMatchObject({
      availability: { status: "available" },
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "cruise_create_command",
        resultReferenceType: "cruise",
        durability: "handler-command-claim-v1",
      },
      durability: {
        strategy: "outbox",
        testReference: "tests/integration/created-target-tools.test.ts",
      },
      effectBoundary: "multistage",
      reversible: false,
    })
    for (const action of cruisesVoyantModule.actions?.filter(
      ({ kind, risk }) => kind === "execute" && risk === "medium",
    ) ?? []) {
      expect(action).toMatchObject({
        ledger: "required",
        approval: "never",
        allowedActorTypes: ["staff"],
      })
      expect(action.reversible).toBe(action.targetLifecycle !== "created")
    }
    for (const id of ["update-cruise", "update-cruise-sailing", "update-cruise-ship"]) {
      expect(
        cruisesVoyantModule.actions?.find(
          ({ id: actionId }) => actionId === `@voyant-travel/cruises#action.${id}`,
        ),
      ).toMatchObject({ commandTargetField: "id" })
    }
  })

  it("declares the emitted cruise lifecycle payload", () => {
    for (const event of cruisesVoyantModule.events ?? []) {
      expect(event.payloadSchema).toEqual({
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      })
    }
  })

  it("preserves deployment-injected lazy route bridges", () => {
    const lazyAdminRoutes = async () => ({}) as never
    const lazyPublicRoutes = async () => ({}) as never
    const module = createCruisesApiModule({ lazyAdminRoutes, lazyPublicRoutes, anonymous: true })
    expect(module).toMatchObject({ lazyAdminRoutes, lazyPublicRoutes, anonymous: true })
    expect(module.adminRoutes).toBeUndefined()
    expect(module.publicRoutes).toBeUndefined()
  })
})

function readApiIds(routes: OpenApiDocumentSource): unknown[] {
  const document = routes.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Cruises", version: "1" },
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
