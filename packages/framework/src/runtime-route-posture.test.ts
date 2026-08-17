import { describe, expect, it, vi } from "vitest"
import { composeVoyantGraphRuntime } from "./runtime-composition.js"
import { createVoyantGraphRuntime } from "./runtime-lowering.js"

function createRoutePostureRuntime(
  load = vi.fn(async () => ({
    createCatalogModule: () => ({ module: { name: "internal-catalog" } }),
  })),
) {
  return {
    load,
    runtime: createVoyantGraphRuntime({
      graphHash: "sha256:route-posture",
      entries: { "@acme/catalog": load },
      modules: [
        {
          id: "@acme/catalog",
          localId: "catalog",
          kind: "module",
          packageName: "@acme/catalog",
          order: 0,
          references: [
            {
              id: "catalog-admin-route",
              unitId: "@acme/catalog",
              facet: "api",
              entityId: "@acme/catalog#api.admin",
              runtime: { entry: "@acme/catalog", export: "createCatalogModule" },
              importEntry: "@acme/catalog",
            },
            {
              id: "catalog-public-route",
              unitId: "@acme/catalog",
              facet: "api",
              entityId: "@acme/catalog#api.public",
              runtime: { entry: "@acme/catalog", export: "createCatalogModule" },
              importEntry: "@acme/catalog",
            },
          ],
          selectedIds: {
            routes: ["@acme/catalog#api.admin", "@acme/catalog#api.public"],
            tools: [],
            events: [],
            webhooks: [],
          },
          routes: [
            {
              route: {
                id: "@acme/catalog#api.admin",
                surface: "admin",
                mount: "catalog",
                transactional: ["/book", "/v1/admin/catalog/quote"],
                runtime: { entry: "@acme/catalog", export: "createCatalogModule" },
              },
              importEntry: "@acme/catalog",
              referenceId: "catalog-admin-route",
            },
            {
              route: {
                id: "@acme/catalog#api.public",
                surface: "public",
                mount: "catalog",
                anonymous: true,
                transactional: ["/book"],
                runtime: { entry: "@acme/catalog", export: "createCatalogModule" },
              },
              importEntry: "@acme/catalog",
              referenceId: "catalog-public-route",
            },
          ],
        },
      ],
      plugins: [],
    }),
  }
}

describe("graph runtime route posture", () => {
  it("keeps selected route posture inspectable without loading the package", () => {
    const { load, runtime } = createRoutePostureRuntime()

    expect(runtime.modules[0]?.routes[1]?.route).toMatchObject({
      surface: "public",
      mount: "catalog",
      anonymous: true,
      transactional: ["/book"],
    })
    expect(load).not.toHaveBeenCalled()
  })

  it("derives public and transactional posture from selected units", async () => {
    const { runtime } = createRoutePostureRuntime()
    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })

    expect(composition.routePosture).toEqual({
      publicPaths: ["/v1/public/catalog"],
      transactionalPaths: [
        "/v1/admin/catalog/book",
        "/v1/admin/catalog/quote",
        "/v1/public/catalog/book",
      ],
      // Nothing declared `publishable`, so the capability line denies the whole
      // public surface to publishable keys (voyant#4625).
      publishablePaths: [],
      guardedIntakePaths: [],
    })
    expect(composition.modules[0]).toMatchObject({
      publicPath: "catalog",
      anonymous: true,
      transactionalPaths: [
        "/v1/admin/catalog/book",
        "/v1/admin/catalog/quote",
        "/v1/public/catalog/book",
      ],
    })
  })

  it("normalizes existing storefront and finance anonymous forms against their mounts", async () => {
    const createModule = (name: string) => () => ({ module: { name } })
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:existing-anonymous-forms",
      entries: {
        "@voyant-travel/public-api": async () => ({
          createPublicApiModule: createModule("storefront"),
        }),
        "@voyant-travel/finance": async () => ({
          createFinanceModule: createModule("finance"),
        }),
      },
      modules: [
        {
          id: "@voyant-travel/public-api",
          kind: "module",
          packageName: "@voyant-travel/public-api",
          order: 0,
          references: [
            {
              id: "storefront-public-route",
              unitId: "@voyant-travel/public-api",
              facet: "api",
              entityId: "@voyant-travel/public-api#api.public",
              runtime: {
                entry: "@voyant-travel/public-api",
                export: "createPublicApiModule",
              },
              importEntry: "@voyant-travel/public-api",
            },
          ],
          selectedIds: {
            routes: ["@voyant-travel/public-api#api.public"],
            tools: [],
            events: [],
            webhooks: [],
          },
          routes: [
            {
              route: {
                id: "@voyant-travel/public-api#api.public",
                surface: "public",
                mount: "/",
                anonymous: ["/leads", "/newsletter", "offers"],
                runtime: {
                  entry: "@voyant-travel/public-api",
                  export: "createPublicApiModule",
                },
              },
              importEntry: "@voyant-travel/public-api",
              referenceId: "storefront-public-route",
            },
          ],
        },
        {
          id: "@voyant-travel/finance",
          kind: "module",
          packageName: "@voyant-travel/finance",
          order: 1,
          references: [
            {
              id: "finance-public-route",
              unitId: "@voyant-travel/finance",
              facet: "api",
              entityId: "@voyant-travel/finance#api.public",
              runtime: { entry: "@voyant-travel/finance", export: "createFinanceModule" },
              importEntry: "@voyant-travel/finance",
            },
          ],
          selectedIds: {
            routes: ["@voyant-travel/finance#api.public"],
            tools: [],
            events: [],
            webhooks: [],
          },
          routes: [
            {
              route: {
                id: "@voyant-travel/finance#api.public",
                surface: "public",
                mount: "finance",
                anonymous: ["/bookings", "/collections", "payment-sessions"],
                transactional: true,
                runtime: {
                  entry: "@voyant-travel/finance",
                  export: "createFinanceModule",
                },
              },
              importEntry: "@voyant-travel/finance",
              referenceId: "finance-public-route",
            },
          ],
        },
      ],
      plugins: [],
    })

    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })

    expect(composition.routePosture).toEqual({
      publicPaths: [
        "/v1/public/finance/bookings",
        "/v1/public/finance/collections",
        "/v1/public/finance/payment-sessions",
        "/v1/public/leads",
        "/v1/public/newsletter",
        "/v1/public/offers",
      ],
      transactionalPaths: ["/v1/public/finance"],
      publishablePaths: [],
      guardedIntakePaths: [],
    })
    expect(composition.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publicPath: "/",
          anonymous: ["/leads", "/newsletter", "/offers"],
        }),
        expect.objectContaining({
          publicPath: "finance",
          anonymous: ["/bookings", "/collections", "/payment-sessions"],
        }),
      ]),
    )
  })

  it("preserves the payment-link root mount instead of falling back to its local id", async () => {
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:payment-link-root-posture",
      entries: {
        "@voyant-travel/finance/payment-link-routes": async () => ({
          createPaymentLinkModule: () => ({
            module: { name: "payment-link" },
            publicPath: "/",
          }),
        }),
      },
      modules: [
        {
          id: "@voyant-travel/finance#payment-link",
          localId: "finance.payment-link",
          kind: "module",
          packageName: "@voyant-travel/public-api",
          order: 0,
          references: [
            {
              id: "payment-link-public-route",
              unitId: "@voyant-travel/finance#payment-link",
              facet: "api",
              entityId: "@voyant-travel/finance#payment-link.api",
              runtime: {
                entry: "@voyant-travel/finance/payment-link-routes",
                export: "createPaymentLinkModule",
              },
              importEntry: "@voyant-travel/finance/payment-link-routes",
            },
          ],
          selectedIds: {
            routes: ["@voyant-travel/finance#payment-link.api"],
            tools: [],
            events: [],
            webhooks: [],
          },
          routes: [
            {
              route: {
                id: "@voyant-travel/finance#payment-link.api",
                surface: "public",
                mount: "/",
                anonymous: ["payment-link-config", "payment-link"],
                runtime: {
                  entry: "@voyant-travel/finance/payment-link-routes",
                  export: "createPaymentLinkModule",
                },
              },
              importEntry: "@voyant-travel/finance/payment-link-routes",
              referenceId: "payment-link-public-route",
            },
          ],
        },
      ],
      plugins: [],
    })

    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })

    expect(composition.routePosture.publicPaths).toEqual([
      "/v1/public/payment-link",
      "/v1/public/payment-link-config",
    ])
    expect(composition.modules[0]).toMatchObject({
      publicPath: "/",
      anonymous: ["/payment-link", "/payment-link-config"],
    })
  })

  it("derives the publishable and guarded-intake allow-lists from the same declarations", async () => {
    // voyant#4625: `anonymous` and `publishable` answer different questions and
    // neither implies the other, so they are derived independently from the
    // same bundle and projected back onto the module's own mount.
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:capability-line",
      entries: {
        "@voyant-travel/public-api": async () => ({
          createPublicApiModule: () => ({ module: { name: "storefront" } }),
        }),
      },
      modules: [
        {
          id: "@voyant-travel/public-api",
          kind: "module",
          packageName: "@voyant-travel/public-api",
          order: 0,
          references: [
            {
              id: "storefront-public-route",
              unitId: "@voyant-travel/public-api",
              facet: "api",
              entityId: "@voyant-travel/public-api#api.public",
              runtime: {
                entry: "@voyant-travel/public-api",
                export: "createPublicApiModule",
              },
              importEntry: "@voyant-travel/public-api",
            },
          ],
          selectedIds: {
            routes: ["@voyant-travel/public-api#api.public"],
            tools: [],
            events: [],
            webhooks: [],
          },
          routes: [
            {
              route: {
                id: "@voyant-travel/public-api#api.public",
                surface: "public",
                mount: "/",
                anonymous: ["/leads", "/departures"],
                publishable: ["/departures", "offers"],
                guardedIntake: ["/leads"],
                runtime: {
                  entry: "@voyant-travel/public-api",
                  export: "createPublicApiModule",
                },
              },
              importEntry: "@voyant-travel/public-api",
              referenceId: "storefront-public-route",
            },
          ],
        },
      ],
      plugins: [],
    })

    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })

    expect(composition.routePosture.publishablePaths).toEqual([
      "/v1/public/departures",
      "/v1/public/offers",
    ])
    expect(composition.routePosture.guardedIntakePaths).toEqual(["/v1/public/leads"])
    expect(composition.modules[0]).toMatchObject({
      publicPath: "/",
      anonymous: ["/departures", "/leads"],
      publishable: ["/departures", "/offers"],
      guardedIntake: ["/leads"],
    })
  })

  it("ignores a publishable declaration on a non-public bundle", async () => {
    // Only the public surface accepts a storefront key at all, so an admin
    // bundle must not be able to widen the list the middleware reads.
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:admin-publishable",
      entries: {
        "@acme/catalog": async () => ({
          createCatalogModule: () => ({ module: { name: "catalog" } }),
        }),
      },
      modules: [
        {
          id: "@acme/catalog",
          localId: "catalog",
          kind: "module",
          packageName: "@acme/catalog",
          order: 0,
          references: [
            {
              id: "catalog-admin-route",
              unitId: "@acme/catalog",
              facet: "api",
              entityId: "@acme/catalog#api.admin",
              runtime: { entry: "@acme/catalog", export: "createCatalogModule" },
              importEntry: "@acme/catalog",
            },
          ],
          selectedIds: {
            routes: ["@acme/catalog#api.admin"],
            tools: [],
            events: [],
            webhooks: [],
          },
          routes: [
            {
              route: {
                id: "@acme/catalog#api.admin",
                surface: "admin",
                mount: "catalog",
                publishable: true,
                runtime: { entry: "@acme/catalog", export: "createCatalogModule" },
              },
              importEntry: "@acme/catalog",
              referenceId: "catalog-admin-route",
            },
          ],
        },
      ],
      plugins: [],
    })

    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })

    expect(composition.routePosture.publishablePaths).toEqual([])
  })
})
