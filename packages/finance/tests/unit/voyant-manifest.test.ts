// agent-quality: file-size exception -- owner: finance; one assertion per
// declared extension in a single package manifest, so the file tracks the
// manifest's own size; splitting it would separate contracts that must be read
// together.
import { createContainer } from "@voyant-travel/core"
import { prepareExternalWebhookEvent } from "@voyant-travel/webhook-delivery"
import { describe, expect, it } from "vitest"
import {
  createFinanceVoyantRuntime,
  FINANCE_CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY,
} from "../../src/index.js"
import {
  financeBookingScheduleVoyantPlugin,
  financeBookingsCreateVoyantPlugin,
  financeBookingTaxPreviewVoyantPlugin,
  financeBookingTaxSettingsVoyantPlugin,
  financeVoyantModule,
} from "../../src/voyant.js"

describe("finance deployment manifest", () => {
  it("owns the module deployment surfaces", () => {
    expect(financeVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/finance",
      packageName: "@voyant-travel/finance",
      provides: {
        capabilities: ["finance.data-owner", "finance.payment-sessions"],
        ports: [
          { id: "action-ledger.finance-drift-runtime" },
          { id: "bookings.finance.runtime" },
          { id: "finance.host.runtime" },
          { id: "finance.app-api.runtime" },
          // The public booking-create route lives in Bookings; Finance
          // supplies the durable command it dispatches.
          { id: "bookings.self-service-create.runtime" },
        ],
      },
      runtime: { entry: "@voyant-travel/finance", export: "createFinanceVoyantRuntime" },
      runtimePorts: [
        { id: "finance.host.runtime" },
        { id: "custom-fields.runtime" },
        { id: "finance.notifications.runtime" },
        { id: "finance.checkout-payment-starters.runtime", optional: true },
        { id: "payments.adapter.runtime", optional: true },
        { id: "finance.invoice-settlement-poller", optional: true, cardinality: "many" },
      ],
      api: [
        {
          id: "@voyant-travel/finance#api.admin",
          surface: "admin",
          openapi: { document: "finance" },
          runtime: { entry: "@voyant-travel/finance", export: "createFinanceApiModule" },
        },
        {
          id: "@voyant-travel/finance#api.public",
          surface: "public",
          openapi: { document: "finance" },
          anonymous: [
            "/bookings",
            "/collections",
            "/payment-sessions",
            "/accountant",
            "/travel-credits",
          ],
          runtime: { entry: "@voyant-travel/finance", export: "createFinanceApiModule" },
        },
      ],
      schema: [{ id: "@voyant-travel/finance#schema" }],
      migrations: [{ id: "@voyant-travel/finance#migrations" }],
      reporting: {
        datasets: [
          {
            id: "finance.receivables",
            version: 1,
            runtime: {
              entry: "@voyant-travel/finance/reporting",
              export: "financeReceivablesDataset",
            },
          },
        ],
        widgets: expect.arrayContaining([
          expect.objectContaining({ id: "finance.outstanding-by-currency" }),
          expect.objectContaining({ id: "finance.net-issued-trend" }),
          expect.objectContaining({ id: "finance.invoice-status-breakdown" }),
        ]),
        templates: [expect.objectContaining({ id: "finance.overview" })],
      },
      setupMigrations: [
        {
          id: "@voyant-travel/finance#setup.vouchers-from-payment-instruments.v1",
          runtime: {
            entry: "@voyant-travel/finance/setup/travel-credits",
            export: "runTravelCreditSetupMigration",
          },
          dependsOn: ["@voyant-travel/finance#migrations"],
        },
      ],
      links: [
        { id: "@voyant-travel/finance#linkable.creditNote" },
        { id: "@voyant-travel/finance#linkable.invoice" },
        { id: "@voyant-travel/finance#linkable.invoiceTemplate" },
        { id: "@voyant-travel/finance#linkable.supplierInvoice" },
      ],
      presentations: [
        {
          id: "@voyant-travel/finance#presentation.public",
          runtime: {
            entry: "@voyant-travel/finance-react/public-routes",
            export: "createFinancePublicRouteContribution",
          },
        },
      ],
    })
    expectConcreteEventSchemas(financeVoyantModule.events)
    expect(
      financeVoyantModule.reporting?.widgets?.every(
        (widget) =>
          !Object.values(widget.visualization.options ?? {}).some((value) => value === undefined),
      ),
    ).toBe(true)
  })

  it("declares Finance access and destructive tool authority", () => {
    expect(financeVoyantModule.access?.resources?.map((resource) => resource.resource)).toEqual([
      "finance",
    ])
    expect(financeVoyantModule.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "list_invoices", risk: "low" }),
        expect.objectContaining({ name: "get_invoice", risk: "low" }),
        expect.objectContaining({ name: "void_invoice", risk: "critical" }),
        expect.objectContaining({ name: "issue_invoice_refund", risk: "critical" }),
        expect.objectContaining({ name: "issue_invoice_from_booking", risk: "high" }),
        expect.objectContaining({
          name: "preview_unsynced_proforma_from_booking",
          risk: "low",
        }),
        expect.objectContaining({
          name: "issue_unsynced_proforma_from_booking",
          risk: "high",
        }),
      ]),
    )
    expect(financeVoyantModule.actions).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/finance#action.issue-invoice-refund",
        requiredScopes: ["finance:refund"],
        risk: "critical",
        ledger: "required",
        approval: "required",
        reversible: false,
        from: { tools: ["@voyant-travel/finance#tool.issue-invoice-refund"] },
      }),
    )
    expect(financeVoyantModule.actions).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/finance#action.issue-invoice-from-booking",
        requiredScopes: ["finance:write", "bookings:read"],
        ledger: "required",
        approval: "required",
        from: {
          tools: [
            "@voyant-travel/finance#tool.issue-invoice-from-booking",
            "@voyant-travel/finance#tool.issue-unsynced-proforma-from-booking",
          ],
        },
      }),
    )
    const capabilityKeys = financeVoyantModule.actions.map(
      (action) => `${action.capabilityId}@${action.version}`,
    )
    expect(new Set(capabilityKeys).size).toBe(capabilityKeys.length)
    expect(financeVoyantModule.actions).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/finance#action.void-invoice",
        commandTargetField: "id",
        requiredScopes: ["finance:void"],
        risk: "critical",
        ledger: "required",
        approval: "required",
        from: { tools: ["@voyant-travel/finance#tool.void-invoice"] },
      }),
    )
  })

  it("projects issued invoice events to stable external document references", () => {
    const issued = financeVoyantModule.events.find((event) => event.eventType === "invoice.issued")
    const proformaIssued = financeVoyantModule.events.find(
      (event) => event.eventType === "invoice.proforma.issued",
    )
    expect(issued).toMatchObject({ visibility: "external", version: "1.0.0" })
    expect(proformaIssued).toMatchObject({
      visibility: "external",
      version: "1.0.0",
      payloadSchema: issued?.payloadSchema,
    })
    expect(financeVoyantModule.webhooks).toEqual([
      {
        id: "@voyant-travel/finance#webhook.invoice-issued",
        direction: "outbound",
        eventId: "@voyant-travel/finance#event.invoice.issued",
      },
      {
        id: "@voyant-travel/finance#webhook.invoice-proforma-issued",
        direction: "outbound",
        eventId: "@voyant-travel/finance#event.invoice.proforma.issued",
      },
      {
        id: "@voyant-travel/finance#webhook.invoice-proforma-converted",
        direction: "outbound",
        eventId: "@voyant-travel/finance#event.invoice.proforma.converted",
      },
      {
        id: "@voyant-travel/finance#webhook.invoice-voided",
        direction: "outbound",
        eventId: "@voyant-travel/finance#event.invoice.voided",
      },
      {
        id: "@voyant-travel/finance#webhook.invoice-payment-recorded",
        direction: "outbound",
        eventId: "@voyant-travel/finance#event.invoice.payment.recorded",
      },
    ])

    const projected = prepareExternalWebhookEvent(
      {
        name: "invoice.issued",
        data: {
          invoiceId: "inv_1",
          invoiceType: "invoice",
          skipExternalSync: false,
          clientEmail: "private@example.test",
          lineItems: [{ description: "Internal line detail" }],
          externalProvider: "internal-routing-hint",
        },
        emittedAt: new Date("2026-07-18T10:00:00.000Z"),
        metadata: {
          graphEventId: "@voyant-travel/finance#event.invoice.issued",
          graphEventVersion: "1.0.0",
        },
      },
      {
        eventId: issued!.id,
        eventType: issued!.eventType!,
        eventVersion: issued!.version!,
        payloadSchema: issued!.payloadSchema!,
      },
    )

    expect(projected.data).toEqual({
      invoiceId: "inv_1",
      invoiceType: "invoice",
      skipExternalSync: false,
    })
  })

  it("projects lifecycle events to minimal PII-free external facts", () => {
    const converted = financeVoyantModule.events.find(
      (event) => event.eventType === "invoice.proforma.converted",
    )
    const voided = financeVoyantModule.events.find((event) => event.eventType === "invoice.voided")
    const paymentRecorded = financeVoyantModule.events.find(
      (event) => event.eventType === "invoice.payment.recorded",
    )
    const settled = financeVoyantModule.events.find(
      (event) => event.eventType === "invoice.settled",
    )

    expect(converted).toMatchObject({
      version: "2.0.0",
      visibility: "external",
      payloadSchema: {
        required: ["invoiceId", "invoiceType", "occurredAt", "lineage"],
        additionalProperties: false,
      },
    })
    expect(voided).toMatchObject({
      version: "2.0.0",
      visibility: "external",
      payloadSchema: {
        required: ["invoiceId", "invoiceType", "occurredAt"],
        additionalProperties: false,
      },
    })
    expect(paymentRecorded).toMatchObject({
      version: "2.0.0",
      visibility: "external",
      payloadSchema: {
        required: [
          "invoiceId",
          "invoiceType",
          "invoiceCurrency",
          "invoiceTotalCents",
          "invoicePaidCents",
          "invoiceBalanceDueCents",
          "paymentId",
          "amountCents",
          "currency",
          "baseCurrency",
          "baseAmountCents",
          "paymentMethod",
          "paymentDate",
          "occurredAt",
        ],
        additionalProperties: false,
      },
    })
    expect(settled).toMatchObject({ visibility: "internal" })
    expect(Object.keys(converted!.payloadSchema!.properties as object).sort()).toEqual([
      "invoiceId",
      "invoiceType",
      "lineage",
      "occurredAt",
    ])
    expect(Object.keys(voided!.payloadSchema!.properties as object).sort()).toEqual([
      "invoiceId",
      "invoiceType",
      "occurredAt",
    ])
    expect(Object.keys(paymentRecorded!.payloadSchema!.properties as object).sort()).toEqual([
      "amountCents",
      "baseAmountCents",
      "baseCurrency",
      "currency",
      "invoiceBalanceDueCents",
      "invoiceCurrency",
      "invoiceId",
      "invoicePaidCents",
      "invoiceTotalCents",
      "invoiceType",
      "occurredAt",
      "paymentDate",
      "paymentId",
      "paymentMethod",
    ])

    const projected = prepareExternalWebhookEvent(
      {
        name: "invoice.proforma.converted",
        data: {
          invoiceId: "invoice_1",
          invoiceType: "invoice",
          occurredAt: "2026-07-18T10:00:00.000Z",
          lineage: {
            sourceDocumentId: "proforma_1",
            successorDocumentId: "invoice_1",
          },
          clientEmail: "private@example.test",
          lineItems: [{ description: "Private line" }],
        },
        emittedAt: new Date("2026-07-18T10:00:00.000Z"),
        metadata: {
          graphEventId: "@voyant-travel/finance#event.invoice.proforma.converted",
          graphEventVersion: "2.0.0",
        },
      },
      {
        eventId: converted!.id,
        eventType: converted!.eventType!,
        eventVersion: converted!.version!,
        payloadSchema: converted!.payloadSchema!,
      },
    )

    expect(projected.data).toEqual({
      invoiceId: "invoice_1",
      invoiceType: "invoice",
      occurredAt: "2026-07-18T10:00:00.000Z",
      lineage: {
        sourceDocumentId: "proforma_1",
        successorDocumentId: "invoice_1",
      },
    })

    for (const [declaration, data] of [
      [
        voided,
        {
          invoiceId: "credit_1",
          invoiceType: "credit_note",
          occurredAt: "2026-07-18T11:00:00.000Z",
        },
      ],
      [
        paymentRecorded,
        {
          invoiceId: "credit_1",
          invoiceType: "credit_note",
          invoiceCurrency: "RON",
          invoiceTotalCents: 10000,
          invoicePaidCents: 2500,
          invoiceBalanceDueCents: 7500,
          paymentId: "payment_1",
          amountCents: 2500,
          currency: "RON",
          baseCurrency: null,
          baseAmountCents: null,
          paymentMethod: "bank_transfer",
          paymentDate: "2026-07-18",
          occurredAt: "2026-07-18T11:00:00.000Z",
        },
      ],
    ] as const) {
      expect(
        prepareExternalWebhookEvent(
          {
            name: declaration!.eventType!,
            data,
            emittedAt: new Date("2026-07-18T11:00:00.000Z"),
            metadata: {
              graphEventId: declaration!.id,
              graphEventVersion: declaration!.version!,
            },
          },
          {
            eventId: declaration!.id,
            eventType: declaration!.eventType!,
            eventVersion: declaration!.version!,
            payloadSchema: declaration!.payloadSchema!,
          },
        ).data,
      ).toEqual(data)
    }
  })

  it("mounts only selected Finance API surfaces", async () => {
    const runtime = await createFinanceVoyantRuntime({
      unitId: "@voyant-travel/finance",
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      api: [{ id: "finance.admin", surface: "admin" }],
      hasPort: () => true,
      getPort: async <TProvider>(port: { id: string }) => {
        const providers: Record<string, unknown> = {
          "finance.host.runtime": {
            primitives: {
              env: () => ({}),
              storage: { downloadUrl: () => undefined },
            },
          },
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
          "finance.notifications.runtime": {
            resolveNotificationDispatcher: () => undefined,
            listBookingReminderRuns: async () => [],
          },
          "finance.checkout-payment-starters.runtime": { resolvePaymentStarters: () => ({}) },
          "payments.adapter.runtime": {
            id: "connected-adapter",
            label: "Connected adapter",
            contractVersion: "voyant.payment-adapter.v1",
            mode: "test",
            capabilities: { callbackSignatureVerification: true },
            initiate: async () => ({}),
            verifyCallback: async () => ({ verified: false, reason: "malformed" }),
            health: async () => ({ status: "ok", checkedAt: new Date().toISOString() }),
          },
        }
        return providers[port.id] as TProvider
      },
      getPorts: async <TProvider>() => [] as TProvider[],
    } as never)

    expect(runtime.adminRoutes).toBeDefined()
    expect(runtime.publicRoutes).toBeUndefined()
    const container = createContainer()
    await runtime.module.bootstrap?.({ bindings: {}, container })
    expect(
      container.resolve<{ selectedPaymentStarter?: unknown }>(
        FINANCE_CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY,
      )?.selectedPaymentStarter,
    ).toBeTypeOf("function")
  })

  it("owns the finance extensions", () => {
    expect([
      financeBookingTaxSettingsVoyantPlugin,
      financeBookingTaxPreviewVoyantPlugin,
      financeBookingsCreateVoyantPlugin,
    ]).toMatchObject([
      {
        schemaVersion: "voyant.extension.v1",
        id: "@voyant-travel/finance#booking-tax-settings-extension",
        localId: "finance.booking-tax-settings-extension",
        runtime: {
          entry: "@voyant-travel/finance",
          export: "createBookingTaxSettingsVoyantRuntime",
        },
        runtimePorts: [{ id: "finance.operator-settings.runtime" }],
        api: [
          {
            id: "@voyant-travel/finance#booking-tax-settings-extension.api",
            surface: "admin",
            mount: "finance",
            openapi: { document: "booking-tax-settings" },
            runtime: {
              entry: "@voyant-travel/finance",
              export: "createBookingTaxSettingsApiExtension",
            },
          },
        ],
      },
      {
        schemaVersion: "voyant.extension.v1",
        id: "@voyant-travel/finance#booking-tax-preview-extension",
        localId: "finance.booking-tax-preview-extension",
        runtime: {
          entry: "@voyant-travel/finance",
          export: "createBookingTaxPreviewVoyantRuntime",
        },
        runtimePorts: [{ id: "finance.operator-settings.runtime" }],
        api: [
          {
            id: "@voyant-travel/finance#booking-tax-preview-extension.api",
            surface: "admin",
            mount: "bookings",
            openapi: { document: "booking-tax-preview" },
            runtime: {
              entry: "@voyant-travel/finance",
              export: "createBookingTaxPreviewApiExtension",
            },
          },
        ],
      },
      {
        schemaVersion: "voyant.extension.v1",
        id: "@voyant-travel/finance#bookings-create-extension",
        tools: [
          expect.objectContaining({
            id: "@voyant-travel/finance#bookings-create-extension.tool.book-product",
            name: "book_product",
            requiredScopes: ["bookings:write", "finance:write"],
          }),
          expect.objectContaining({
            id: "@voyant-travel/finance#bookings-create-extension.tool.create-booking",
            name: "create_booking",
            requiredScopes: ["bookings:write", "finance:write"],
          }),
        ],
        actions: [
          expect.objectContaining({
            id: "@voyant-travel/finance#bookings-create-extension.action.create-booking",
            availability: { status: "available" },
            effectBoundary: "multistage",
            durability: {
              strategy: "outbox",
              testReference: "tests/integration/booking-create.test.ts",
            },
            targetLifecycle: "created",
            createdTarget: {
              commandTargetType: "finance_booking_create_command",
              resultReferenceType: "booking",
              durability: "handler-command-claim-v1",
            },
            ledger: "required",
            allowedActorTypes: ["staff"],
            from: {
              tools: ["@voyant-travel/finance#bookings-create-extension.tool.create-booking"],
            },
          }),
          // Intent-level workflow action (voyant#3933): same command and target,
          // distinct capability identity, server-resolved reference and key.
          expect.objectContaining({
            id: "@voyant-travel/finance#bookings-create-extension.action.book-product",
            availability: { status: "available" },
            targetLifecycle: "created",
            createdTarget: {
              commandTargetType: "finance_booking_create_command",
              resultReferenceType: "booking",
              durability: "handler-command-claim-v1",
            },
            ledger: "required",
            allowedActorTypes: ["staff"],
            from: {
              tools: ["@voyant-travel/finance#bookings-create-extension.tool.book-product"],
            },
          }),
          // Self-service creation is a separate action over the same command:
          // customer-only, route-bound, and never exposed as a Tool.
          expect.objectContaining({
            id: "@voyant-travel/finance#bookings-create-extension.action.create-booking-self-service",
            targetLifecycle: "created",
            createdTarget: {
              commandTargetType: "finance_booking_create_command",
              resultReferenceType: "booking",
              durability: "handler-command-claim-v1",
            },
            ledger: "required",
            allowedActorTypes: ["customer"],
            from: { routes: ["@voyant-travel/bookings#api.public"] },
            // Fail closed: unavailable until a deployment selects a provider
            // that can resolve a public draft/quote into a create command.
            availability: {
              status: "unavailable",
              reasonCode: "self-service-booking-source-unavailable",
              enableWhen: {
                selectedProviderPorts: {
                  mode: "all",
                  ports: ["finance.self-service-booking-source.runtime"],
                },
              },
            },
          }),
        ],
      },
    ])
  })

  it("owns the booking schedule bridge with package runtime references", () => {
    expect(financeBookingScheduleVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/finance#booking-schedule-extension",
      packageName: "@voyant-travel/finance",
      runtime: {
        entry: "@voyant-travel/finance",
        export: "createBookingScheduleVoyantRuntime",
      },
      runtimePorts: [
        { id: "finance.host.runtime" },
        { id: "finance.operator-settings.runtime" },
        { id: "finance.distribution-payment-policy.runtime" },
        { id: "finance.accommodations-payment-policy.runtime" },
        { id: "finance.cruises-payment-policy.runtime" },
        { id: "finance.inventory-payment-policy.runtime" },
      ],
      api: [
        {
          id: "@voyant-travel/finance#booking-schedule-extension.api.admin",
          surface: "admin",
          mount: "bookings",
          openapi: { document: "bookings" },
          runtime: {
            entry: "@voyant-travel/finance",
            export: "createBookingScheduleApiExtension",
          },
        },
        {
          id: "@voyant-travel/finance#booking-schedule-extension.api.public",
          surface: "public",
          mount: "payment-policy",
          openapi: { document: "bookings" },
          anonymous: true,
          runtime: {
            entry: "@voyant-travel/finance",
            export: "createBookingScheduleApiExtension",
          },
        },
      ],
      subscribers: [
        {
          id: "@voyant-travel/finance#subscriber.booking-schedule-confirmed",
          eventType: "booking.confirmed",
          source: "@voyant-travel/finance/booking-schedule-subscriber",
          runtime: {
            entry: "@voyant-travel/finance/booking-schedule-subscriber",
            export: "bookingScheduleConfirmedSubscriber",
          },
        },
        {
          id: "@voyant-travel/finance#subscriber.proforma-conversion",
          eventType: "invoice.settled",
          source: "@voyant-travel/finance/proforma-conversion-subscriber",
          runtime: {
            entry: "@voyant-travel/finance/proforma-conversion-subscriber",
            export: "proformaConversionSubscriber",
          },
        },
      ],
    })
  })

  it("declares finance routes and existing cross-package widgets", () => {
    expect(financeVoyantModule.admin?.routes?.map(({ id, path }) => [id, path])).toEqual([
      ["@voyant-travel/finance#admin.route.index", "/finance"],
      ["@voyant-travel/finance#admin.route.invoices-index", "/finance/invoices"],
      ["@voyant-travel/finance#admin.route.invoices-detail", "/finance/invoices/$id"],
      [
        "@voyant-travel/finance#admin.route.invoice-number-series",
        "/finance/invoice-number-series",
      ],
      ["@voyant-travel/finance#admin.route.payments-index", "/finance/payments"],
      ["@voyant-travel/finance#admin.route.payments-detail", "/finance/payments/$id"],
      ["@voyant-travel/finance#admin.route.supplier-invoices-index", "/finance/supplier-invoices"],
      [
        "@voyant-travel/finance#admin.route.supplier-invoices-detail",
        "/finance/supplier-invoices/$id",
      ],
      ["@voyant-travel/finance#admin.route.profitability", "/finance/profitability"],
    ])
    expect(financeVoyantModule.admin?.contributions?.map(({ id, slotId }) => [id, slotId])).toEqual(
      [
        [
          "@voyant-travel/finance#admin.contribution.booking-payment-controller",
          "booking.details.payment-controller",
        ],
        [
          "@voyant-travel/finance#admin.contribution.booking-invoices",
          "booking.details.invoices-tab",
        ],
        [
          "@voyant-travel/finance#admin.contribution.booking-pending-payment-sessions",
          "booking.details.finance-start",
        ],
        [
          "@voyant-travel/finance#admin.contribution.booking-payment-policy",
          "booking.details.finance-end",
        ],
        [
          "@voyant-travel/finance#admin.contribution.supplier-payment-policy",
          "supplier.details.payment-policy",
        ],
      ],
    )
    expect(
      financeVoyantModule.admin?.routes?.every((route) =>
        route.requiredScopes?.includes("finance:read"),
      ),
    ).toBe(true)
    expect(
      financeVoyantModule.admin?.contributions?.every((contribution) =>
        contribution.requiredScopes?.includes("finance:read"),
      ),
    ).toBe(true)
    expect(financeVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/finance#admin.route.invoices-index",
        label: { namespace: "finance.admin", key: "invoicesPage.title" },
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
