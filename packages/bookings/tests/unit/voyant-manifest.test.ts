import { describe, expect, it } from "vitest"
import { createBookingsVoyantRuntime } from "../../src/index.js"
import { createBookingRequirementsVoyantRuntime } from "../../src/requirements/index.js"
import { publicBookingRequirementsRoutes } from "../../src/requirements/routes-public.js"
import {
  bookingRequirementsVoyantModule,
  bookingsSupplierVoyantPlugin,
  bookingsVoyantModule,
} from "../../src/voyant.js"

describe("bookings deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(bookingsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/bookings",
      packageName: "@voyant-travel/bookings",
      provides: {
        capabilities: ["bookings.data-owner"],
        ports: [
          { id: "action-ledger.booking-drift-runtime" },
          { id: "custom-fields.value-lifecycle" },
          { id: "custom-fields.value-operations" },
          { id: "bookings.stale-holds-job" },
        ],
      },
      runtime: { entry: "@voyant-travel/bookings", export: "createBookingsVoyantRuntime" },
      runtimePorts: [
        { id: "bookings.accommodation.runtime" },
        { id: "custom-fields.runtime" },
        { id: "bookings.finance.runtime" },
        { id: "bookings.stale-holds-job" },
        { id: "bookings.relationships.runtime" },
        // Finance composes the durable create command; Bookings owns the
        // public resource. Optional, so a deployment without it serves no
        // public creation route.
        { id: "bookings.self-service-create.runtime", optional: true },
        // Authorizes a guest create; without it only authenticated customers
        // can use the public create route.
        { id: "bookings.guest-verification.runtime", optional: true },
        { id: "bookings.supplier-amendment.runtime", optional: true },
      ],
      api: [
        {
          id: "@voyant-travel/bookings#api.admin",
          surface: "admin",
          openapi: { document: "bookings" },
          resource: "bookings",
          runtime: { entry: "@voyant-travel/bookings", export: "createBookingsApiModule" },
        },
        {
          id: "@voyant-travel/bookings#api.public",
          surface: "public",
          openapi: { document: "bookings" },
          resource: "bookings",
          anonymous: true,
          runtime: { entry: "@voyant-travel/bookings", export: "createBookingsApiModule" },
        },
      ],
      schema: [{ id: "@voyant-travel/bookings#schema" }],
      migrations: [{ id: "@voyant-travel/bookings#migrations" }],
      config: [
        {
          id: "@voyant-travel/bookings#config.monthly-booking-limit",
          key: "VOYANT_BOOKINGS_MONTHLY_LIMIT",
          required: false,
        },
      ],
      links: [{ id: "@voyant-travel/bookings#linkable.booking" }],
      jobs: [
        {
          id: "bookings.expire-stale-holds",
          schedule: { cron: "*/5 * * * *", overlap: "skip" },
          scheduling: {
            required: true,
            profiles: {
              eager: { cron: "* * * * *", overlap: "skip" },
              economical: { cron: "*/15 * * * *", overlap: "skip" },
              "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
            },
          },
          runtime: {
            entry: "@voyant-travel/bookings/stale-holds-job",
            export: "runBookingsExpireStaleHoldsJob",
          },
        },
      ],
    })

    expectConcreteEventSchemas(bookingsVoyantModule.events)
  })

  it("owns the selected Bookings access catalog", () => {
    expect(bookingsVoyantModule.access?.resources).toEqual([
      expect.objectContaining({
        resource: "bookings",
        actions: expect.arrayContaining([
          expect.objectContaining({ action: "read" }),
          expect.objectContaining({ action: "write" }),
        ]),
      }),
      expect.objectContaining({
        resource: "bookings-pii",
        wildcard: "explicit-resource",
        actions: [expect.objectContaining({ action: "read", sensitive: true })],
      }),
    ])
    expect(bookingsVoyantModule.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "list_bookings", risk: "low" }),
        expect.objectContaining({ name: "get_booking", risk: "low" }),
        expect.objectContaining({ name: "confirm_booking", risk: "high" }),
        expect.objectContaining({ name: "cancel_booking", risk: "critical" }),
      ]),
    )
    expect(bookingsVoyantModule.actions).toContainEqual(
      expect.objectContaining({
        id: "booking.status.cancel",
        requiredScopes: ["bookings:write"],
        risk: "critical",
        ledger: "required",
        approval: "required",
        reversible: false,
        availability: { status: "available" },
        effectBoundary: "multistage",
        from: expect.objectContaining({
          routes: ["@voyant-travel/bookings#api.admin"],
          tools: ["@voyant-travel/bookings#tool.cancel-booking"],
        }),
      }),
    )
    expect(bookingsVoyantModule.admin?.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "@voyant-travel/bookings#admin.route.index",
          requiredScopes: ["bookings:read"],
        }),
        expect.objectContaining({
          id: "@voyant-travel/bookings#admin.route.new",
          requiredScopes: ["bookings:write", "finance:write"],
        }),
      ]),
    )
    expect(bookingsVoyantModule.admin?.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "@voyant-travel/bookings#admin.contribution.person-bookings",
          requiredScopes: ["bookings:read"],
        }),
      ]),
    )
    expect(bookingsVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/bookings#admin.route.index",
        label: { namespace: "bookings.admin", key: "bookingsPage.title" },
      }),
    ])
  })

  it("owns the requirements module and supplier extension", () => {
    expect(bookingRequirementsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/bookings#requirements",
      packageName: "@voyant-travel/bookings",
      runtime: {
        entry: "@voyant-travel/bookings/requirements",
        export: "createBookingRequirementsVoyantRuntime",
      },
      runtimePorts: [{ id: "bookings.inventory.runtime" }],
      requires: { capabilities: ["bookings.data-owner"] },
      api: [
        {
          id: "@voyant-travel/bookings#requirements.api",
          surface: "admin",
          mount: "booking-requirements",
          resource: "bookings",
          openapi: { document: "booking-requirements" },
          runtime: {
            entry: "@voyant-travel/bookings/requirements",
            export: "createBookingRequirementsApiModule",
          },
        },
        {
          id: "@voyant-travel/bookings#requirements.api.public",
          surface: "public",
          mount: "booking-requirements",
          resource: "bookings",
          openapi: { document: "booking-requirements" },
          runtime: {
            entry: "@voyant-travel/bookings/requirements",
            export: "createBookingRequirementsApiModule",
          },
        },
      ],
    })
    expect(
      bookingRequirementsVoyantModule.tools
        ?.filter((tool) => tool.requiredScopes.includes("bookings:write"))
        .map((tool) => tool.risk),
    ).toEqual(Array(16).fill("high"))

    expect(
      Object.fromEntries(
        (bookingRequirementsVoyantModule.actions ?? [])
          .filter(({ id }) => id.includes(".action.update-"))
          .map(({ id, commandTargetField }) => [id.split(".action.")[1], commandTargetField]),
      ),
    ).toEqual({
      "update-booking-answer": "id",
      "update-booking-question-extra-trigger": "id",
      "update-booking-question-option": "id",
      "update-booking-question-option-trigger": "id",
      "update-booking-question-unit-trigger": "id",
      "update-option-booking-question": "id",
      "update-product-booking-question": "id",
      "update-product-contact-requirement": "id",
    })

    expect(bookingsSupplierVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/bookings#booking-supplier-extension",
      packageName: "@voyant-travel/bookings",
      api: [
        {
          id: "@voyant-travel/bookings#booking-supplier-extension.api",
          surface: "admin",
          mount: "bookings",
          openapi: { document: "bookings" },
          runtime: {
            entry: "@voyant-travel/bookings/extensions/suppliers",
            export: "bookingsSupplierExtension",
          },
        },
      ],
    })

    expect(readApiIds(publicBookingRequirementsRoutes)).toEqual([
      "@voyant-travel/bookings#requirements.api.public",
    ])
  })

  it("mounts only selected Bookings API surfaces", async () => {
    const context = {
      unitId: "@voyant-travel/bookings",
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      api: [{ id: "bookings.public", surface: "public" as const }],
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: {},
      hasPort: () => true,
      getPort: async <TProvider>(port: { id: string }) => {
        const providers: Record<string, unknown> = {
          "bookings.accommodation.runtime": { enrichOverviewItems: async () => [] },
          "custom-fields.runtime": {
            resolveRegistry: async () => ({
              all: () => [],
              entities: () => [],
              field: () => undefined,
              forEntity: () => [],
            }),
            resolveRegistryForWrite: async () => ({
              all: () => [],
              entities: () => [],
              field: () => undefined,
              forEntity: () => [],
            }),
            resolveVisibleValues: async () => ({}),
          },
          "bookings.finance.runtime": {
            createStaleBookingHoldsJobRuntime: () => ({}),
            quoteBookingAmendment: async () => {
              throw new Error("not used")
            },
            recordBookingAmendment: async () => {
              throw new Error("not used")
            },
          },
          "bookings.supplier-amendment.runtime": {
            dispatch: async () => [],
            reconcile: async () => [],
          },
          "bookings.relationships.runtime": {
            loadPersonTravelSnapshot: async () => null,
            upsertPersonFromContact: async () => null,
            getPersonById: async () => null,
            getOrganizationById: async () => null,
          },
        }
        return providers[port.id] as TProvider
      },
      getPorts: async <TProvider>() => [] as TProvider[],
    }
    const bookings = await createBookingsVoyantRuntime(context)
    const requirements = await createBookingRequirementsVoyantRuntime({
      ...context,
      unitId: "@voyant-travel/bookings#requirements",
      getPort: async <TProvider>() => ({ resolveProductSnapshot: async () => null }) as TProvider,
    })

    expect(bookings.adminRoutes).toBeUndefined()
    expect(bookings.publicRoutes).toBeDefined()
    expect(requirements.adminRoutes).toBeUndefined()
    expect(requirements.publicRoutes).toBeDefined()
  })

  it("declares the packaged booking routes, slots, and CRM contribution", () => {
    expect(bookingsVoyantModule.admin).toMatchObject({
      routes: [
        { id: "@voyant-travel/bookings#admin.route.index", path: "/bookings" },
        { id: "@voyant-travel/bookings#admin.route.detail", path: "/bookings/$id" },
        { id: "@voyant-travel/bookings#admin.route.new", path: "/bookings/new" },
        { id: "@voyant-travel/bookings#admin.route.compose", path: "/bookings/compose" },
        {
          id: "@voyant-travel/bookings#admin.route.journey",
          path: "/catalog/journey/$entityModule/$entityId",
        },
      ],
      slots: [
        { id: "bookings.list.header-actions" },
        { id: "booking.details.payment-controller" },
        { id: "booking.details.invoices-tab" },
        { id: "booking.details.finance-start" },
        { id: "booking.details.finance-end" },
      ],
      contributions: [
        {
          id: "@voyant-travel/bookings#admin.contribution.person-bookings",
          slotId: "person.details.bookings-tab",
        },
      ],
    })

    const runtimeReferences = [
      ...(bookingsVoyantModule.admin?.routes ?? []),
      ...(bookingsVoyantModule.admin?.contributions ?? []),
    ].map((facet) => facet.runtime)
    expect(new Set(runtimeReferences.map((runtime) => JSON.stringify(runtime)))).toEqual(
      new Set([
        JSON.stringify({
          entry: "@voyant-travel/bookings-react/admin",
          export: "createBookingsAdminExtension",
        }),
      ]),
    )
  })
})

function readApiIds(routes: OpenApiDocumentSource): unknown[] {
  const document = routes.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Bookings", version: "1" },
  })
  return Object.values(document.paths ?? {}).flatMap((path) =>
    Object.values(path).map((operation) => operation["x-voyant-api-id"]),
  )
}

function expectConcreteEventSchemas(events: readonly { payloadSchema: unknown }[]) {
  for (const event of events) {
    expect(event.payloadSchema).toEqual(
      expect.objectContaining({
        type: "object",
        required: expect.any(Array),
        properties: expect.any(Object),
      }),
    )
  }
}

interface OpenApiDocumentSource {
  getOpenAPI31Document(input: { openapi: "3.1.0"; info: { title: string; version: string } }): {
    paths?: Record<string, Record<string, Record<string, unknown>>>
  }
}
