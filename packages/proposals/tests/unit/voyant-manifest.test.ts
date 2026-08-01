import { describe, expect, it } from "vitest"
import {
  bookingProposalExtensionRoutes,
  PROPOSALS_BOOKING_OPENAPI_API_ID,
} from "../../src/booking-extension.js"
import {
  createProposalPresentationPublicRoutes,
  createProposalVersionSnapshotRoutes,
  PROPOSAL_PROPOSAL_OPENAPI_API_IDS,
  PROPOSAL_VERSION_SNAPSHOT_OPENAPI_API_ID,
} from "../../src/proposal-routes.js"
import {
  proposalsBookingVoyantPlugin,
  proposalsPresentationVoyantExtension,
  proposalsVersionSnapshotVoyantPlugin,
  proposalsVoyantModule,
} from "../../src/voyant.js"

describe("proposals deployment manifests", () => {
  it("owns the module runtime, persistence, and link facets", () => {
    expect(proposalsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/proposals",
      packageName: "@voyant-travel/proposals",
      provides: {
        ports: [
          { id: "proposals.checkout-inquiry.runtime" },
          { id: "proposals.runtime" },
          { id: "custom-fields.value-lifecycle" },
          { id: "custom-fields.value-operations" },
        ],
      },
      api: [
        {
          id: "@voyant-travel/proposals#api",
          surface: "admin",
          mount: "proposals",
          openapi: { document: "proposals" },
          transactional: true,
          runtime: { entry: "@voyant-travel/proposals", export: "createProposalsVoyantRuntime" },
        },
      ],
      schema: [{ id: "@voyant-travel/proposals#schema" }],
      migrations: [{ id: "@voyant-travel/proposals#migrations" }],
      admin: {
        runtime: {
          entry: "@voyant-travel/proposals-react/admin",
          export: "createSelectedProposalsAdminExtension",
        },
        copy: [
          {
            id: "@voyant-travel/proposals#admin.copy",
            namespace: "proposals.admin",
          },
        ],
        routes: [
          {
            id: "@voyant-travel/proposals#admin.route.proposals-index",
            path: "/proposals",
            requiredScopes: ["proposals:read"],
          },
          {
            id: "@voyant-travel/proposals#admin.route.proposals-detail",
            path: "/proposals/$id",
            requiredScopes: ["proposals:read"],
          },
        ],
        nav: [
          {
            id: "@voyant-travel/proposals#admin.nav.proposals",
            routeId: "@voyant-travel/proposals#admin.route.proposals-index",
            label: { namespace: "proposals.admin", key: "proposalsBoardPage.title" },
          },
        ],
      },
      links: [
        { id: "@voyant-travel/proposals#linkable.proposal" },
        { id: "@voyant-travel/proposals#linkable.proposalVersion" },
      ],
    })
    expectConcreteEventSchemas(proposalsVoyantModule.events)
  })

  it("owns the booking extension", () => {
    expect(proposalsBookingVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/proposals#booking-extension",
      packageName: "@voyant-travel/proposals",
      api: [
        {
          id: "@voyant-travel/proposals#booking-extension.api",
          mount: "bookings",
          openapi: { document: "proposals-booking" },
          runtime: {
            entry: "@voyant-travel/proposals/booking-extension",
            export: "proposalsBookingExtension",
          },
        },
      ],
    })

    expect(readApiIds(bookingProposalExtensionRoutes)).toEqual(
      Array.from({ length: 3 }, () => PROPOSALS_BOOKING_OPENAPI_API_ID),
    )
  })

  it("owns the proposal and proposal-version snapshot bridges", () => {
    expect([
      proposalsPresentationVoyantExtension,
      proposalsVersionSnapshotVoyantPlugin,
    ]).toMatchObject([
      {
        schemaVersion: "voyant.extension.v1",
        id: "@voyant-travel/proposals#presentation-extension",
        requires: { capabilities: ["notifications.delivery"] },
        provides: { ports: [{ id: "proposals.presentation-runtime" }] },
        api: [
          {
            id: "@voyant-travel/proposals#presentation-extension.api.admin",
            surface: "admin",
            mount: "proposal-versions",
            resource: "proposals",
            openapi: { document: "proposals" },
            runtime: {
              entry: "@voyant-travel/proposals",
              export: "createProposalPresentationVoyantRuntime",
            },
          },
          {
            surface: "public",
            mount: "proposals",
            anonymous: true,
            openapi: { document: "proposals-public" },
            runtime: {
              entry: "@voyant-travel/proposals",
              export: "createProposalPresentationVoyantRuntime",
            },
          },
        ],
      },
      {
        schemaVersion: "voyant.extension.v1",
        id: "@voyant-travel/proposals#proposal-version-snapshot-extension",
        provides: { ports: [{ id: "proposals.snapshot-runtime" }] },
        api: [
          {
            surface: "admin",
            mount: "trips",
            openapi: { document: "proposal-version-snapshot" },
            runtime: {
              entry: "@voyant-travel/proposals",
              export: "createProposalVersionSnapshotVoyantRuntime",
            },
          },
        ],
      },
    ])

    const document = (
      createProposalPresentationPublicRoutes({} as never) as OpenApiDocumentSource
    ).getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "Public proposals", version: "1" },
    })
    const operations = Object.values(document.paths ?? {}).flatMap((path) =>
      Object.values(path).filter((operation) => typeof operation === "object"),
    ) as Array<Record<string, unknown>>
    expect(operations).toHaveLength(4)
    expect(
      operations.every(
        (operation) => operation["x-voyant-api-id"] === PROPOSAL_PROPOSAL_OPENAPI_API_IDS.public,
      ),
    ).toBe(true)

    expect(readApiIds(createProposalVersionSnapshotRoutes({} as never))).toEqual([
      PROPOSAL_VERSION_SNAPSHOT_OPENAPI_API_ID,
    ])
  })

  it("binds the complete proposal lifecycle to guarded staff actions", () => {
    expect(proposalsVoyantModule.tools?.map(({ name }) => name)).toEqual([
      "list_proposals",
      "get_proposal",
      "list_proposal_pipelines",
      "list_proposal_stages",
      "create_proposal",
      "add_proposal_product",
      "snapshot_proposal_version",
      "send_proposal_version",
      "accept_proposal_version",
      "decline_proposal_version",
    ])
    for (const name of [
      "snapshot-proposal-version",
      "send-proposal-version",
      "accept-proposal-version",
      "decline-proposal-version",
    ]) {
      expect(
        proposalsVoyantModule.actions?.find(
          ({ id }) => id === `@voyant-travel/proposals#action.${name}`,
        ),
      ).toMatchObject({
        kind: "execute",
        ...(name === "snapshot-proposal-version"
          ? { commandTargetField: "proposalId" }
          : { commandTargetField: "proposalVersionId" }),
        resource: "proposals",
        action: "write",
        ledger: "required",
        reversible: false,
        allowedActorTypes: ["staff"],
      })
    }
    expect(
      proposalsVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/proposals#action.snapshot-proposal-version",
      ),
    ).toMatchObject({
      targetType: "proposal",
      commandTargetField: "proposalId",
      targetLifecycle: "existing",
    })
    expect(
      proposalsVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/proposals#action.accept-proposal-version",
      ),
    ).toMatchObject({ risk: "high", approval: "required" })
  })

  it("owns the cross-module proposal snapshot and notification action", () => {
    expect(proposalsPresentationVoyantExtension).toMatchObject({
      requires: { capabilities: ["notifications.delivery"] },
      runtimePorts: [
        { id: "proposals.presentation-runtime" },
        { id: "proposals.notifications.runtime", optional: true },
        {
          id: "notifications.durable-provider",
          optional: true,
          conformance: {
            entry: "@voyant-travel/notifications/durable-provider-port",
            export: "durableNotificationProviderPort",
          },
        },
      ],
      tools: [
        {
          id: "@voyant-travel/proposals#presentation-extension.tool.snapshot-and-send-proposal",
          name: "snapshot_and_send_proposal",
          requiredScopes: ["proposals:write", "notifications:send"],
          context: ["proposalDelivery"],
          risk: "high",
        },
      ],
      actions: [
        {
          id: "@voyant-travel/proposals#presentation-extension.action.snapshot-and-send-proposal",
          version: "v2",
          commandTargetField: "proposalId",
          targetLifecycle: "existing",
          existingTarget: { durability: "handler-command-result-v1" },
          availability: {
            status: "unavailable",
            reasonCode: "provider-idempotency-unavailable",
            enableWhen: {
              selectedProviderPorts: {
                mode: "all",
                ports: ["notifications.durable-provider"],
              },
            },
          },
          effectBoundary: "multistage",
          durability: {
            strategy: "saga",
            testReference: "packages/proposals/tests/integration/proposal-delivery.test.ts",
          },
          ledger: "required",
          approval: "required",
          reversible: false,
          allowedActorTypes: ["staff"],
        },
      ],
    })
  })
})

function readApiIds(routes: OpenApiDocumentSource): unknown[] {
  const document = routes.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Proposals extension", version: "1" },
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
