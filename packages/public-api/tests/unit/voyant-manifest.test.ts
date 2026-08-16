import {
  catalogPublicationRuntimePort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/runtime-contracts"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import { createPublicApiVoyantRuntime } from "../../src/index.js"
import {
  publicApiCustomerPortalRuntimePort,
  publicApiIntakeRuntimePort,
  publicApiOffersRuntimePort,
  publicApiPaymentLinkRuntimePort,
  publicApiPaymentReconciliationJobRuntimePort,
} from "../../src/runtime-port.js"
import {
  publicApiDynamicPackageSourceProviderPort,
  publicApiOpaqueReferenceIssuerPort,
  publicApiPresentationFxProviderPort,
  publicApiShoppingLiveProviderPort,
} from "../../src/shopping/provider-ports.js"
import {
  publicApiShoppingRuntimePort,
  publicApiTripSelectionsRuntimePort,
} from "../../src/shopping/runtime-port.js"
import {
  publicApiCustomerPortalVoyantModule,
  publicApiPaymentLinkVoyantModule,
  publicApiShoppingProviderVoyantModule,
  publicApiVoyantModule,
} from "../../src/voyant.js"

describe("storefront deployment manifest", () => {
  it("exports import-cheap runtime port contracts", () => {
    expect(publicApiIntakeRuntimePort.id).toBe("public-api.intake.runtime")
    expect(publicApiPaymentLinkRuntimePort.id).toBe("public-api.payment-link.runtime")
    expect(publicApiPaymentReconciliationJobRuntimePort.id).toBe(
      "public-api.payment-reconciliation-job.runtime",
    )
  })

  it("declares the optional OSS shopping provider graph", () => {
    expect(publicApiShoppingProviderVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/public-api#shopping-provider",
      provides: { ports: [{ id: publicApiShoppingRuntimePort.id }] },
      runtimePorts: [
        { id: "catalog.search-runtime" },
        { id: catalogRuntimeServicesPort.id },
        { id: "flights.runtime", optional: true },
        { id: publicApiShoppingLiveProviderPort.id, optional: true },
        { id: publicApiDynamicPackageSourceProviderPort.id, optional: true },
        { id: publicApiOpaqueReferenceIssuerPort.id },
        { id: publicApiPresentationFxProviderPort.id, optional: true },
      ],
    })
  })

  it("owns the base runtime, persistence, and verification link facets", () => {
    expect(publicApiVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/public-api",
      packageName: "@voyant-travel/public-api",
      provides: {
        capabilities: ["public-api.data-owner"],
        ports: [
          { id: publicApiOffersRuntimePort.id },
          { id: "auth.customer-business-onboarding.runtime" },
        ],
      },
      runtime: { entry: "@voyant-travel/public-api", export: "createPublicApiVoyantRuntime" },
      runtimePorts: [
        { id: "public-api.offers.runtime" },
        { id: "public-api.intake.runtime" },
        { id: catalogPublicationRuntimePort.id },
        { id: publicApiShoppingRuntimePort.id, optional: true },
        { id: publicApiTripSelectionsRuntimePort.id, optional: true },
      ],
      api: [
        {
          id: "@voyant-travel/public-api#api.admin",
          surface: "admin",
          mount: "public-api",
          openapi: { document: "public-api" },
          runtime: {
            entry: "@voyant-travel/public-api",
            export: "createPublicApiModule",
          },
        },
        {
          id: "@voyant-travel/public-api#api.public",
          surface: "public",
          mount: "/",
          resource: "public-api",
          openapi: { document: "public-api" },
          anonymous: [
            "/bookings",
            "/departures",
            "/leads",
            "/newsletter",
            "/offers",
            "/shopping",
            "/settings",
          ],
          runtime: {
            entry: "@voyant-travel/public-api",
            export: "createPublicApiModule",
          },
        },
      ],
      resources: [{ id: "@voyant-travel/public-api#resource.database", kind: "database" }],
      lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
    })
  })

  it("mounts only selected Storefront API surfaces", async () => {
    const requestedPorts: string[] = []
    const isProductPublished = vi.fn(async () => false)
    const runtime = await createPublicApiVoyantRuntime({
      unitId: "@voyant-travel/public-api",
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      hostOptions: {},
      api: [{ id: "public-api.public", surface: "public" }],
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
        requestedPorts.push(port.id)
        return (
          port.id === catalogPublicationRuntimePort.id ? { isProductPublished } : {}
        ) as TProvider
      },
      getPorts: async <TProvider>() => [] as TProvider[],
    })

    expect(runtime.adminRoutes).toBeUndefined()
    expect(runtime.publicRoutes).toBeDefined()
    expect(requestedPorts).toContain(catalogPublicationRuntimePort.id)

    const db = {}
    const app = new Hono()
      .use("*", async (context, next) => {
        context.set("db" as never, db as never)
        context.set(
          "publicChannel" as never,
          {
            channelId: "chan_bound",
            channelStatus: "active",
          } as never,
        )
        await next()
      })
      .route("/", runtime.publicRoutes as never)
    await app.request("/products/prod_1/departures")

    expect(isProductPublished).toHaveBeenCalledWith({
      db,
      productId: "prod_1",
      channelId: "chan_bound",
    })
  })

  it("does not duplicate externally owned event authority", () => {
    const events = new Map(
      publicApiVoyantModule.events?.map(({ eventType, payloadSchema }) => [
        eventType,
        payloadSchema,
      ]),
    )

    expect(events.has("customer.signal.created")).toBe(false)
  })

  it("owns package-namespaced storefront fragments", () => {
    expect([publicApiCustomerPortalVoyantModule]).toMatchObject([
      {
        schemaVersion: "voyant.module.v1",
        id: "@voyant-travel/public-api#customer-portal",
        packageName: "@voyant-travel/public-api",
        provides: { ports: [{ id: publicApiCustomerPortalRuntimePort.id }] },
        requires: { capabilities: ["public-api.data-owner"] },
        runtime: {
          entry: "@voyant-travel/public-api/customer-portal",
          export: "createCustomerPortalVoyantRuntime",
        },
        runtimePorts: [{ id: "public-api.customer-portal.runtime" }],
        api: [
          {
            id: "@voyant-travel/public-api#customer-portal.api",
            surface: "public",
            mount: "customer-portal",
            resource: "public-api",
            openapi: { document: "customer-portal" },
            runtime: {
              entry: "@voyant-travel/public-api/customer-portal",
              export: "createCustomerPortalApiModule",
            },
          },
        ],
      },
    ])
    expect(publicApiVoyantModule.provides?.ports).not.toContainEqual({
      id: publicApiCustomerPortalRuntimePort.id,
    })
  })

  it("owns the payment-link bridge", () => {
    expect(publicApiPaymentLinkVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/public-api#payment-link",
      packageName: "@voyant-travel/public-api",
      requires: { capabilities: ["public-api.data-owner"] },
      runtime: {
        entry: "@voyant-travel/public-api/payment-link",
        export: "createPaymentLinkVoyantRuntime",
      },
      runtimePorts: [
        { id: "public-api.payment-link.runtime" },
        { id: "public-api.payment-reconciliation-job.runtime" },
        { id: "payments.adapter.runtime", optional: true },
      ],
      api: [
        {
          id: "@voyant-travel/public-api#payment-link.api",
          surface: "public",
          mount: "/",
          resource: "public-api",
          openapi: { document: "payment-link" },
          anonymous: ["payment-link-config", "payment-link"],
          runtime: {
            entry: "@voyant-travel/public-api/payment-link",
            export: "createPaymentLinkApiModule",
          },
        },
      ],
      jobs: [
        {
          id: "public-api.reconcile-payment-sessions",
          schedule: { every: "1m", overlap: "skip" },
          scheduling: { required: true },
          runtime: {
            entry: "@voyant-travel/public-api/payment-reconciliation-job",
            export: "runPaymentAdapterReconciliationJob",
          },
        },
      ],
    })
    const reconciliation = publicApiPaymentLinkVoyantModule.jobs?.find(
      ({ id }) => id === "public-api.reconcile-payment-sessions",
    )
    expect(reconciliation).toMatchObject({
      schedule: { every: "1m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { every: "1m", overlap: "skip" },
          economical: { every: "5m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/public-api/payment-reconciliation-job",
        export: "runPaymentAdapterReconciliationJob",
      },
    })
  })

  it("declares executable Tools and action-ledger bindings for every extension surface", () => {
    expect(publicApiCustomerPortalVoyantModule.tools).toHaveLength(13)
    expect(publicApiCustomerPortalVoyantModule.actions).toHaveLength(5)
    // The verification DOMAIN moved to identity (voyant#4627). Its four Tools
    // stayed, because resolving the customer's OWN destination needs the
    // customer portal's composed profile — so they hang off this package's
    // main graph unit rather than a module of their own.
    expect(publicApiVoyantModule.tools).toHaveLength(4)
    expect(publicApiVoyantModule.actions).toHaveLength(2)
    expect(publicApiPaymentLinkVoyantModule.tools).toHaveLength(2)
    expect(publicApiPaymentLinkVoyantModule.actions).toHaveLength(2)
    expect(publicApiVoyantModule.tools?.every(({ risk }) => risk === "high")).toBe(true)
    expect(
      publicApiPaymentLinkVoyantModule.tools?.find(
        ({ name }) => name === "create_invoice_payment_link",
      )?.risk,
    ).toBe("high")

    for (const module of [publicApiCustomerPortalVoyantModule, publicApiPaymentLinkVoyantModule]) {
      expect(module.meta?.agentTools).toBeUndefined()
      expect(
        module.tools?.every(({ runtime }) => runtime.entry === "@voyant-travel/public-api/tools"),
      ).toBe(true)
      expect(module.actions?.every(({ ledger }) => ledger === "required")).toBe(true)
    }

    expect(publicApiCustomerPortalVoyantModule.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ allowedActorTypes: ["customer"], approval: "never" }),
      ]),
    )
    expect(
      publicApiVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/public-api#action.start-my-verification",
      ),
    ).toMatchObject({
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
    })
    expect(publicApiPaymentLinkVoyantModule.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "@voyant-travel/public-api#action.create-invoice-payment-link",
          targetType: "invoice",
          commandTargetField: "invoiceId",
          targetLifecycle: "existing",
          allowedActorTypes: ["staff"],
          approval: "required",
          existingTarget: { durability: "handler-command-result-v1" },
        }),
      ]),
    )
  })
})
