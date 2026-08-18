import { bookingsRelationshipsRuntimePort } from "@voyant-travel/bookings/runtime-port"
import { createContainer, createEventBus } from "@voyant-travel/core"
import {
  customFieldsRuntimePort,
  customFieldValueLifecycleRuntimePort,
  customFieldValueReaderRuntimePort,
} from "@voyant-travel/core/custom-fields"
import { assertPortConforms } from "@voyant-travel/core/project"
import { customFieldValueOperationsRuntimePort } from "@voyant-travel/core/runtime-port"
import { financeStoredInstrumentRuntimePort } from "@voyant-travel/finance/runtime-port"
import { proposalInquiryConversionRuntimePort } from "@voyant-travel/proposals-contracts/inquiry-conversion"
import { describe, expect, it, vi } from "vitest"
import { createRelationshipsVoyantRuntime, relationshipsRouteRuntimePort } from "../../src/index.js"
import { RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY } from "../../src/route-runtime.js"
import { relationshipsRoutes } from "../../src/routes/index.js"
import { createRelationshipsRuntimePortContribution } from "../../src/runtime-contributor.js"
import { relationshipsMiceRuntimePort } from "../../src/runtime-port.js"
import { relationshipsVoyantModule } from "../../src/voyant.js"

describe("relationships deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(relationshipsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/relationships",
      packageName: "@voyant-travel/relationships",
      provides: {
        ports: [
          { id: "public-api.intake.runtime" },
          { id: relationshipsMiceRuntimePort.id },
          { id: bookingsRelationshipsRuntimePort.id },
          { id: financeStoredInstrumentRuntimePort.id },
          { id: relationshipsRouteRuntimePort.id },
          { id: customFieldValueReaderRuntimePort.id },
          { id: customFieldValueLifecycleRuntimePort.id },
          { id: customFieldValueOperationsRuntimePort.id },
          { id: "relationships.booking-enrichment-database" },
        ],
      },
      runtimePorts: [
        { id: customFieldsRuntimePort.id },
        { id: "relationships.route-runtime" },
        { id: "relationships.booking-enrichment-database" },
        { id: proposalInquiryConversionRuntimePort.id, optional: true },
        // Optional: a deployment can select CRM without Bookings, and then
        // nothing emits `booking.confirmed` for the enrichment subscriber.
        { id: "bookings.crm-snapshot.runtime", optional: true },
      ],
      api: [
        {
          id: "@voyant-travel/relationships#api.admin",
          surface: "admin",
          mount: "relationships",
          resource: "crm",
          openapi: { document: "relationships" },
          transactional: true,
          runtime: {
            entry: "@voyant-travel/relationships",
            export: "createRelationshipsVoyantRuntime",
          },
        },
      ],
      schema: [{ id: "@voyant-travel/relationships#schema" }],
      migrations: [{ id: "@voyant-travel/relationships#migrations" }],
      links: [
        { id: "@voyant-travel/relationships#linkable.organization" },
        { id: "@voyant-travel/relationships#linkable.person" },
      ],
    })
    expect(relationshipsVoyantModule.access?.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: "crm" }),
        expect.objectContaining({
          resource: "relationships-pii",
          actions: [expect.objectContaining({ action: "read", sensitive: true })],
        }),
      ]),
    )
    expect(relationshipsVoyantModule.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "inquiry.converted",
          audit: { sourceModule: "relationships", category: "domain" },
        }),
      ]),
    )
    expect(relationshipsVoyantModule.tools).toHaveLength(20)
    const toolActions = (relationshipsVoyantModule.actions ?? []).filter(
      (action) => action.from?.tools?.length,
    )
    expect(toolActions).toHaveLength(20)
    for (const tool of relationshipsVoyantModule.tools ?? []) {
      const action = toolActions.find((candidate) => candidate.from?.tools?.includes(tool.id))
      expect(action).toBeDefined()
      if (tool.requiredScopes.includes("crm:write")) {
        expect(action).toMatchObject({
          kind: "execute",
          ledger: "required",
          approval: "never",
          reversible: action?.targetLifecycle !== "created",
        })
      }
      if (tool.risk === "high" && tool.requiredScopes.includes("crm:read")) {
        expect(action).toMatchObject({
          kind: "sensitive-read",
          ledger: "required",
          approval: "never",
        })
      }
    }
    expect(
      relationshipsVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/relationships#action.create-person",
      ),
    ).toMatchObject({
      availability: { status: "available" },
      effectBoundary: "multistage",
      targetType: "person",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "person_create_command",
        resultReferenceType: "person",
        durability: "handler-command-claim-v1",
      },
      durability: {
        strategy: "outbox",
        testReference: "packages/relationships/tests/integration/person-created-command.test.ts",
      },
      reversible: false,
      allowedActorTypes: ["staff"],
    })
    expect(
      relationshipsVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/relationships#action.create-organization",
      ),
    ).toMatchObject({
      availability: { status: "available" },
      effectBoundary: "multistage",
      targetType: "organization",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "organization_create_command",
        resultReferenceType: "organization",
        durability: "handler-command-claim-v1",
      },
      durability: {
        strategy: "outbox",
        testReference:
          "packages/relationships/tests/integration/organization-created-command.test.ts",
      },
      reversible: false,
      allowedActorTypes: ["staff"],
    })
    for (const ownerType of ["person", "organization"] as const) {
      for (const childType of ["note", "contact-method", "address"] as const) {
        const toolId = `@voyant-travel/relationships#tool.add-${ownerType}-${childType}`
        const matchingActions = toolActions.filter((action) => action.from?.tools?.includes(toolId))
        expect(matchingActions).toHaveLength(1)
        expect(matchingActions[0]).toMatchObject({
          id: `@voyant-travel/relationships#action.add-${ownerType}-${childType}`,
          targetType: ownerType,
          commandTargetField: "entityId",
          targetLifecycle: "existing",
        })
      }
    }
    for (const id of [
      "update-organization",
      "update-person",
      "update-relationship-address",
      "update-relationship-contact-method",
      "update-relationship-note",
    ]) {
      expect(
        relationshipsVoyantModule.actions?.find(
          ({ id: actionId }) => actionId === `@voyant-travel/relationships#action.${id}`,
        ),
      ).toMatchObject({ commandTargetField: "id" })
    }
    expectConcreteEventSchemas(relationshipsVoyantModule.events)
  })

  it("ships a typed route runtime port and package-owned graph factory", async () => {
    const customFields = vi.fn(async () => ({
      all: () => [],
      entities: () => [],
      field: () => undefined,
      forEntity: () => [],
    }))
    const customFieldsForWrite = vi.fn(customFields)
    const proposalInquiryConversion = { convertInquiry: vi.fn() }
    await expect(
      assertPortConforms(relationshipsRouteRuntimePort, {
        customFields,
        customFieldsForWrite,
        proposalInquiryConversion,
      }),
    ).resolves.toBeUndefined()
    await expect(
      assertPortConforms(relationshipsRouteRuntimePort, { customFields: true } as never),
    ).rejects.toThrow(/customFields/)
    await expect(
      assertPortConforms(relationshipsRouteRuntimePort, { customFieldsForWrite: true } as never),
    ).rejects.toThrow(/customFieldsForWrite/)

    const module = await createRelationshipsVoyantRuntime({
      unitId: relationshipsVoyantModule.id,
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      hostOptions: {},
      api: relationshipsVoyantModule.api ?? [],
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: {},
      hasPort: () => true,
      getPort: vi.fn(async () => ({
        customFields,
        customFieldsForWrite,
        proposalInquiryConversion,
      })) as never,
      getPorts: vi.fn(async () => []) as never,
    })
    const container = createContainer()
    await module.module.bootstrap?.({ bindings: {}, container, eventBus: createEventBus() })

    expect(module.module.requiresTransactionalDb).toBe(true)
    expect(module.adminRoutes).toBe(relationshipsRoutes)
    expect(container.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY)).toMatchObject({
      customFields,
      customFieldsForWrite,
      proposalInquiryConversion: { convertInquiry: expect.any(Function) },
    })
  })

  it("omits Proposal conversion from the route runtime when its optional port is absent", () => {
    const contribution = createRelationshipsRuntimePortContribution({
      primitives: {} as never,
      hasRuntimePort: (port) => port.id !== proposalInquiryConversionRuntimePort.id,
      getRuntimePort: vi.fn(async () => ({
        resolveRegistry: vi.fn(async () => ({ all: () => [] })),
        resolveRegistryForWrite: vi.fn(async () => ({ all: () => [] })),
      })) as never,
    })

    expect(contribution[relationshipsRouteRuntimePort.id]).not.toHaveProperty(
      "proposalInquiryConversion",
    )
  })

  it("declares the packaged relationships admin routes and person-detail slot", () => {
    expect(relationshipsVoyantModule.admin).toMatchObject({
      routes: expect.arrayContaining(
        [
          ["people-index", "/people"],
          ["people-detail", "/people/$id"],
          ["organizations-index", "/organizations"],
          ["organizations-detail", "/organizations/$id"],
        ].map(([id, path]) =>
          expect.objectContaining({
            id: `@voyant-travel/relationships#admin.route.${id}`,
            path,
            runtime: {
              entry: "@voyant-travel/relationships-react/admin",
              export: "createRelationshipsAdminExtension",
            },
          }),
        ),
      ),
      slots: [
        {
          id: "person.details.bookings-tab",
          routeId: "@voyant-travel/relationships#admin.route.people-detail",
          contract: { personId: "string" },
        },
      ],
    })
    expect(
      relationshipsVoyantModule.admin?.routes?.every((route) =>
        route.requiredScopes?.includes("crm:read"),
      ),
    ).toBe(true)
    expect(relationshipsVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/relationships#admin.route.people-index",
        label: { namespace: "relationships.admin", key: "peoplePage.title" },
      }),
      expect.objectContaining({
        routeId: "@voyant-travel/relationships#admin.route.organizations-index",
        label: { namespace: "relationships.admin", key: "organizationsPage.title" },
      }),
    ])
  })
})

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
