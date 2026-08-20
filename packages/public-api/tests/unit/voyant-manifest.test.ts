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
} from "../../src/runtime-port.js"
import {
  publicApiDynamicPackageSourceProviderPort,
  publicApiOpaqueReferenceIssuerPort,
  publicApiPresentationFxProviderPort,
  publicApiShoppingLiveProviderPort,
} from "../../src/shopping/provider-ports.js"
import { publicApiShoppingRuntimePort } from "../../src/shopping/runtime-port.js"
import {
  publicApiCustomerPortalVoyantModule,
  publicApiShoppingProviderVoyantModule,
  publicApiVoyantModule,
} from "../../src/voyant.js"

describe("storefront deployment manifest", () => {
  it("exports import-cheap runtime port contracts", () => {
    expect(publicApiIntakeRuntimePort.id).toBe("public-api.intake.runtime")
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

  it("declares executable Tools and action-ledger bindings for every extension surface", () => {
    expect(publicApiCustomerPortalVoyantModule.tools).toHaveLength(13)
    // Six actions, thirteen Tools: claiming Booking access is an action without
    // a Tool. Granting a Buyer Account access to a Booking is the authorization
    // decision the rest of the customer plane trusts, so it is deliberately not
    // an agent surface (see the allowlist in check-agent-write-coverage.ts).
    expect(publicApiCustomerPortalVoyantModule.actions).toHaveLength(6)
    // The verification DOMAIN moved to identity (voyant#4627). Its four Tools
    // stayed, because resolving the customer's OWN destination needs the
    // customer portal's composed profile — so they hang off this package's
    // main graph unit rather than a module of their own.
    expect(publicApiVoyantModule.tools).toHaveLength(4)
    expect(publicApiVoyantModule.actions).toHaveLength(2)
    expect(publicApiVoyantModule.tools?.every(({ risk }) => risk === "high")).toBe(true)

    for (const module of [publicApiCustomerPortalVoyantModule]) {
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
  })
})
