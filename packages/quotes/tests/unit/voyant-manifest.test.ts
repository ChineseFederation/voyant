import { describe, expect, it } from "vitest"
import {
  bookingQuoteExtensionRoutes,
  QUOTES_BOOKING_OPENAPI_API_ID,
} from "../../src/booking-extension.js"
import {
  createQuoteProposalPublicRoutes,
  createQuoteVersionSnapshotRoutes,
  QUOTE_PROPOSAL_OPENAPI_API_IDS,
  QUOTE_VERSION_SNAPSHOT_OPENAPI_API_ID,
} from "../../src/proposal-routes.js"
import {
  quotesBookingVoyantPlugin,
  quotesProposalVoyantPlugin,
  quotesVersionSnapshotVoyantPlugin,
  quotesVoyantModule,
} from "../../src/voyant.js"

describe("quotes deployment manifests", () => {
  it("owns the module runtime, persistence, and link facets", () => {
    expect(quotesVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/quotes",
      packageName: "@voyant-travel/quotes",
      provides: {
        ports: [
          { id: "quotes.checkout-inquiry.runtime" },
          { id: "quotes.runtime" },
          { id: "custom-fields.value-lifecycle" },
          { id: "custom-fields.value-operations" },
        ],
      },
      api: [
        {
          id: "@voyant-travel/quotes#api",
          surface: "admin",
          mount: "quotes",
          openapi: { document: "quotes" },
          transactional: true,
          runtime: { entry: "@voyant-travel/quotes", export: "createQuotesVoyantRuntime" },
        },
      ],
      schema: [{ id: "@voyant-travel/quotes#schema" }],
      migrations: [{ id: "@voyant-travel/quotes#migrations" }],
      admin: {
        runtime: {
          entry: "@voyant-travel/quotes-react/admin",
          export: "createSelectedQuotesAdminExtension",
        },
        copy: [
          {
            id: "@voyant-travel/quotes#admin.copy",
            namespace: "quotes.admin",
          },
        ],
        routes: [
          {
            id: "@voyant-travel/quotes#admin.route.quotes-index",
            path: "/quotes",
            requiredScopes: ["quotes:read"],
          },
          {
            id: "@voyant-travel/quotes#admin.route.quotes-detail",
            path: "/quotes/$id",
            requiredScopes: ["quotes:read"],
          },
        ],
        nav: [
          {
            id: "@voyant-travel/quotes#admin.nav.quotes",
            routeId: "@voyant-travel/quotes#admin.route.quotes-index",
            label: { namespace: "quotes.admin", key: "quotesBoardPage.title" },
          },
        ],
      },
      links: [
        { id: "@voyant-travel/quotes#linkable.quote" },
        { id: "@voyant-travel/quotes#linkable.quoteVersion" },
      ],
    })
    expectConcreteEventSchemas(quotesVoyantModule.events)
  })

  it("owns the booking extension", () => {
    expect(quotesBookingVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/quotes#booking-extension",
      packageName: "@voyant-travel/quotes",
      api: [
        {
          id: "@voyant-travel/quotes#booking-extension.api",
          mount: "bookings",
          openapi: { document: "quotes-booking" },
          runtime: {
            entry: "@voyant-travel/quotes/booking-extension",
            export: "quotesBookingExtension",
          },
        },
      ],
    })

    expect(readApiIds(bookingQuoteExtensionRoutes)).toEqual(
      Array.from({ length: 3 }, () => QUOTES_BOOKING_OPENAPI_API_ID),
    )
  })

  it("owns the proposal and quote-version snapshot bridges", () => {
    expect([quotesProposalVoyantPlugin, quotesVersionSnapshotVoyantPlugin]).toMatchObject([
      {
        schemaVersion: "voyant.extension.v1",
        id: "@voyant-travel/quotes#proposal-extension",
        requires: { capabilities: ["notifications.delivery"] },
        provides: { ports: [{ id: "quotes.proposal-runtime" }] },
        api: [
          {
            id: "@voyant-travel/quotes#proposal-extension.api.admin",
            surface: "admin",
            mount: "quote-versions",
            resource: "quotes",
            openapi: { document: "quotes" },
            runtime: {
              entry: "@voyant-travel/quotes",
              export: "createQuoteProposalVoyantRuntime",
            },
          },
          {
            surface: "public",
            mount: "proposals",
            anonymous: true,
            openapi: { document: "quotes-proposal-public" },
            runtime: {
              entry: "@voyant-travel/quotes",
              export: "createQuoteProposalVoyantRuntime",
            },
          },
        ],
      },
      {
        schemaVersion: "voyant.extension.v1",
        id: "@voyant-travel/quotes#quote-version-snapshot-extension",
        provides: { ports: [{ id: "quotes.snapshot-runtime" }] },
        api: [
          {
            surface: "admin",
            mount: "trips",
            openapi: { document: "quote-version-snapshot" },
            runtime: {
              entry: "@voyant-travel/quotes",
              export: "createQuoteVersionSnapshotVoyantRuntime",
            },
          },
        ],
      },
    ])

    const document = (
      createQuoteProposalPublicRoutes({} as never) as OpenApiDocumentSource
    ).getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "Public quote proposals", version: "1" },
    })
    const operations = Object.values(document.paths ?? {}).flatMap((path) =>
      Object.values(path).filter((operation) => typeof operation === "object"),
    ) as Array<Record<string, unknown>>
    expect(operations).toHaveLength(4)
    expect(
      operations.every(
        (operation) => operation["x-voyant-api-id"] === QUOTE_PROPOSAL_OPENAPI_API_IDS.public,
      ),
    ).toBe(true)

    expect(readApiIds(createQuoteVersionSnapshotRoutes({} as never))).toEqual([
      QUOTE_VERSION_SNAPSHOT_OPENAPI_API_ID,
    ])
  })

  it("binds the complete proposal lifecycle to guarded staff actions", () => {
    expect(quotesVoyantModule.tools?.map(({ name }) => name)).toEqual([
      "list_quotes",
      "get_quote",
      "list_quote_pipelines",
      "list_quote_stages",
      "create_quote",
      "add_quote_product",
      "snapshot_quote_version",
      "send_quote_version",
      "accept_quote_version",
      "decline_quote_version",
    ])
    for (const name of [
      "snapshot-quote-version",
      "send-quote-version",
      "accept-quote-version",
      "decline-quote-version",
    ]) {
      expect(
        quotesVoyantModule.actions?.find(({ id }) => id === `@voyant-travel/quotes#action.${name}`),
      ).toMatchObject({
        kind: "execute",
        ...(name === "snapshot-quote-version"
          ? { commandTargetField: "quoteId" }
          : { commandTargetField: "quoteVersionId" }),
        resource: "quotes",
        action: "write",
        ledger: "required",
        reversible: false,
        allowedActorTypes: ["staff"],
      })
    }
    expect(
      quotesVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/quotes#action.snapshot-quote-version",
      ),
    ).toMatchObject({
      targetType: "quote",
      commandTargetField: "quoteId",
      targetLifecycle: "existing",
    })
    expect(
      quotesVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/quotes#action.accept-quote-version",
      ),
    ).toMatchObject({ risk: "high", approval: "required" })
  })

  it("owns the cross-module proposal snapshot and notification action", () => {
    expect(quotesProposalVoyantPlugin).toMatchObject({
      requires: { capabilities: ["notifications.delivery"] },
      runtimePorts: [
        { id: "quotes.proposal-runtime" },
        { id: "quotes.notifications.runtime", optional: true },
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
          id: "@voyant-travel/quotes#proposal-extension.tool.snapshot-and-send-quote",
          name: "snapshot_and_send_quote",
          requiredScopes: ["quotes:write", "notifications:send"],
          context: ["quoteDelivery"],
          risk: "high",
        },
      ],
      actions: [
        {
          id: "@voyant-travel/quotes#proposal-extension.action.snapshot-and-send-quote",
          version: "v2",
          commandTargetField: "quoteId",
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
            testReference: "packages/quotes/tests/integration/quote-delivery.test.ts",
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
    info: { title: "Quotes extension", version: "1" },
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
