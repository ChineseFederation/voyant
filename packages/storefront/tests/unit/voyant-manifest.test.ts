import { describe, expect, it } from "vitest"
import { createStorefrontVoyantRuntime } from "../../src/index.js"
import {
  storefrontCustomerPortalRuntimePort,
  storefrontIntakeRuntimePort,
  storefrontOffersRuntimePort,
  storefrontPaymentLinkRuntimePort,
  storefrontPaymentReconciliationJobRuntimePort,
} from "../../src/runtime-port.js"
import {
  storefrontCustomerPortalVoyantModule,
  storefrontPaymentLinkVoyantModule,
  storefrontVerificationVoyantModule,
  storefrontVoyantModule,
} from "../../src/voyant.js"

describe("storefront deployment manifest", () => {
  it("exports import-cheap runtime port contracts", () => {
    expect(storefrontIntakeRuntimePort.id).toBe("storefront.intake.runtime")
    expect(storefrontPaymentLinkRuntimePort.id).toBe("storefront.payment-link.runtime")
    expect(storefrontPaymentReconciliationJobRuntimePort.id).toBe(
      "storefront.payment-reconciliation-job.runtime",
    )
  })

  it("owns the base runtime, persistence, and verification link facets", () => {
    expect(storefrontVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/storefront",
      packageName: "@voyant-travel/storefront",
      provides: {
        capabilities: ["storefront.data-owner"],
        ports: [
          { id: storefrontOffersRuntimePort.id },
          { id: "auth.customer-business-onboarding.runtime" },
        ],
      },
      runtime: { entry: "@voyant-travel/storefront", export: "createStorefrontVoyantRuntime" },
      runtimePorts: [{ id: "storefront.offers.runtime" }, { id: "storefront.intake.runtime" }],
      api: [
        {
          id: "@voyant-travel/storefront#api.admin",
          surface: "admin",
          mount: "storefront",
          openapi: { document: "storefront" },
          runtime: {
            entry: "@voyant-travel/storefront",
            export: "createStorefrontApiModule",
          },
        },
        {
          id: "@voyant-travel/storefront#api.public",
          surface: "public",
          mount: "/",
          resource: "storefront",
          openapi: { document: "storefront" },
          anonymous: ["/bookings", "/departures", "/leads", "/newsletter", "/offers", "/settings"],
          runtime: {
            entry: "@voyant-travel/storefront",
            export: "createStorefrontApiModule",
          },
        },
      ],
      schema: [
        {
          id: "@voyant-travel/storefront#schema",
          source: "@voyant-travel/storefront/verification/schema",
        },
      ],
      migrations: [
        {
          id: "@voyant-travel/storefront#migrations",
          source: "./migrations",
        },
      ],
      links: [
        {
          id: "@voyant-travel/storefront#linkable.storefrontVerificationChallenge",
          source: "@voyant-travel/storefront/verification",
          export: "storefrontVerificationLinkable",
        },
      ],
      resources: [{ id: "@voyant-travel/storefront#resource.database", kind: "database" }],
      lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
    })
  })

  it("mounts only selected Storefront API surfaces", async () => {
    const runtime = await createStorefrontVoyantRuntime({
      unitId: "@voyant-travel/storefront",
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      api: [{ id: "storefront.public", surface: "public" }],
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: {},
      hasPort: () => true,
      getPort: async <TProvider>() => ({}) as TProvider,
      getPorts: async <TProvider>() => [] as TProvider[],
    })

    expect(runtime.adminRoutes).toBeUndefined()
    expect(runtime.publicRoutes).toBeDefined()
  })

  it("does not duplicate externally owned event authority", () => {
    const events = new Map(
      storefrontVoyantModule.events?.map(({ eventType, payloadSchema }) => [
        eventType,
        payloadSchema,
      ]),
    )

    expect(events.has("customer.signal.created")).toBe(false)
  })

  it("owns package-namespaced storefront fragments", () => {
    expect([
      storefrontCustomerPortalVoyantModule,
      storefrontVerificationVoyantModule,
    ]).toMatchObject([
      {
        schemaVersion: "voyant.module.v1",
        id: "@voyant-travel/storefront#customer-portal",
        packageName: "@voyant-travel/storefront",
        provides: { ports: [{ id: storefrontCustomerPortalRuntimePort.id }] },
        requires: { capabilities: ["storefront.data-owner"] },
        runtime: {
          entry: "@voyant-travel/storefront/customer-portal",
          export: "createCustomerPortalVoyantRuntime",
        },
        runtimePorts: [{ id: "storefront.customer-portal.runtime" }],
        api: [
          {
            id: "@voyant-travel/storefront#customer-portal.api",
            surface: "public",
            mount: "customer-portal",
            resource: "storefront",
            openapi: { document: "customer-portal" },
            anonymous: ["/contact-exists"],
            runtime: {
              entry: "@voyant-travel/storefront/customer-portal",
              export: "createCustomerPortalApiModule",
            },
          },
        ],
      },
      {
        schemaVersion: "voyant.module.v1",
        id: "@voyant-travel/storefront#verification",
        packageName: "@voyant-travel/storefront",
        requires: { capabilities: ["storefront.data-owner"] },
        runtime: {
          entry: "@voyant-travel/storefront/verification",
          export: "createStorefrontVerificationVoyantRuntime",
        },
        runtimePorts: [{ id: "storefront.verification.runtime" }],
        api: [
          {
            id: "@voyant-travel/storefront#verification.api",
            surface: "public",
            mount: "storefront-verification",
            openapi: { document: "storefront-verification" },
            anonymous: true,
            runtime: {
              entry: "@voyant-travel/storefront/verification",
              export: "createStorefrontVerificationApiModule",
            },
          },
        ],
      },
    ])
    expect(storefrontVoyantModule.provides?.ports).not.toContainEqual({
      id: storefrontCustomerPortalRuntimePort.id,
    })
  })

  it("owns the payment-link bridge", () => {
    expect(storefrontPaymentLinkVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/storefront#payment-link",
      packageName: "@voyant-travel/storefront",
      requires: { capabilities: ["storefront.data-owner"] },
      runtime: {
        entry: "@voyant-travel/storefront/payment-link",
        export: "createPaymentLinkVoyantRuntime",
      },
      runtimePorts: [
        { id: "storefront.payment-link.runtime" },
        { id: "storefront.payment-reconciliation-job.runtime" },
        { id: "payments.adapter.runtime", optional: true },
      ],
      api: [
        {
          id: "@voyant-travel/storefront#payment-link.api",
          surface: "public",
          mount: "/",
          resource: "storefront",
          openapi: { document: "payment-link" },
          anonymous: ["payment-link-config", "payment-link"],
          runtime: {
            entry: "@voyant-travel/storefront/payment-link",
            export: "createPaymentLinkApiModule",
          },
        },
      ],
      jobs: [
        {
          id: "storefront.reconcile-payment-sessions",
          schedule: { every: "1m", overlap: "skip" },
          scheduling: { required: true },
          runtime: {
            entry: "@voyant-travel/storefront/payment-reconciliation-job",
            export: "runPaymentAdapterReconciliationJob",
          },
        },
      ],
    })
    const reconciliation = storefrontPaymentLinkVoyantModule.jobs?.find(
      ({ id }) => id === "storefront.reconcile-payment-sessions",
    )
    expect(reconciliation).toMatchObject({
      schedule: { every: "1m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { every: "1m", overlap: "skip" },
          economical: { every: "5m", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/storefront/payment-reconciliation-job",
        export: "runPaymentAdapterReconciliationJob",
      },
    })
  })

  it("declares executable Tools and action-ledger bindings for every extension surface", () => {
    expect(storefrontCustomerPortalVoyantModule.tools).toHaveLength(13)
    expect(storefrontCustomerPortalVoyantModule.actions).toHaveLength(5)
    expect(storefrontVerificationVoyantModule.tools).toHaveLength(4)
    expect(storefrontVerificationVoyantModule.actions).toHaveLength(2)
    expect(storefrontPaymentLinkVoyantModule.tools).toHaveLength(2)
    expect(storefrontPaymentLinkVoyantModule.actions).toHaveLength(2)
    expect(storefrontVerificationVoyantModule.tools?.every(({ risk }) => risk === "high")).toBe(
      true,
    )
    expect(
      storefrontPaymentLinkVoyantModule.tools?.find(
        ({ name }) => name === "create_invoice_payment_link",
      )?.risk,
    ).toBe("high")

    for (const module of [
      storefrontCustomerPortalVoyantModule,
      storefrontVerificationVoyantModule,
      storefrontPaymentLinkVoyantModule,
    ]) {
      expect(module.meta?.agentTools).toBeUndefined()
      expect(
        module.tools?.every(({ runtime }) => runtime.entry === "@voyant-travel/storefront/tools"),
      ).toBe(true)
      expect(module.actions?.every(({ ledger }) => ledger === "required")).toBe(true)
    }

    expect(storefrontCustomerPortalVoyantModule.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ allowedActorTypes: ["customer"], approval: "never" }),
      ]),
    )
    expect(
      storefrontVerificationVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/storefront#action.start-my-verification",
      ),
    ).toMatchObject({
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
    })
    expect(storefrontPaymentLinkVoyantModule.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "@voyant-travel/storefront#action.create-invoice-payment-link",
          targetType: "invoice",
          commandTargetField: "invoiceId",
          targetLifecycle: "existing",
          allowedActorTypes: ["staff"],
          approval: "required",
        }),
      ]),
    )
  })
})
