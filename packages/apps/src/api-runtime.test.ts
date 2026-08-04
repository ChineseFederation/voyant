import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import { createAppsApiModule } from "./api-runtime.js"
import { appsManagedAuthRuntimePort, appsManagedMarketplaceRuntimePort } from "./runtime-port.js"

const graph = {
  providerSelections: {},
  customFieldTargets: [],
  accessCatalog: { resources: [], presets: [] },
  eventCatalog: { schemaVersion: "voyant.event-catalog.v1", events: [] },
  tools: [],
  references: [],
  setupSteps: [],
} as const

function context(
  managedAuth?: {
    runtimeAudience: string
    installationAuthority: {
      workloadEnvironmentId: string
      resolveInstallationContract: () => Promise<{ contractGeneration: number }>
    }
    sessionTokenSigningSecret: string
    sessionTokenTtlSeconds?: number
  },
  managedMarketplace?: {
    deploymentId: string
    acquisitionResolver: {
      resolveAcquisitionIntent: () => Promise<null>
      createSetupHandoff: () => Promise<{ redirectUrl: string }>
      notifyInstallationLifecycle: () => Promise<void>
      completeInstallationSetup?: () => Promise<void>
    }
  },
): VoyantGraphRuntimeFactoryContext {
  return {
    unitId: "@voyant-travel/apps",
    projectConfig: {},
    getUnitProjectConfig: () => undefined,
    api: [],
    graph,
    runtimePorts: {
      ...(managedAuth ? { [appsManagedAuthRuntimePort.id]: managedAuth } : {}),
      ...(managedMarketplace ? { [appsManagedMarketplaceRuntimePort.id]: managedMarketplace } : {}),
    },
    hostOptions: {},
    hasPort: (port) =>
      (port.id === appsManagedAuthRuntimePort.id && managedAuth !== undefined) ||
      (port.id === appsManagedMarketplaceRuntimePort.id && managedMarketplace !== undefined),
    getPort: async (port) => {
      if (port.id === appsManagedAuthRuntimePort.id && managedAuth) return managedAuth as never
      if (port.id === appsManagedMarketplaceRuntimePort.id && managedMarketplace) {
        return managedMarketplace as never
      }
      throw new Error(`missing ${port.id}`)
    },
    getPorts: async () => [],
  }
}

describe("createAppsApiModule", () => {
  it("keeps managed auth and client-authenticated routes off without host inputs", async () => {
    const module = await createAppsApiModule(context())

    expect(module.clientAuthenticated).toBeUndefined()
    expect(module.authAugmentation).toBeUndefined()
  })

  it("composes OAuth, session exchange, and token resolution from the host port", async () => {
    const module = await createAppsApiModule(
      context({
        runtimeAudience: "deployment-1",
        installationAuthority: {
          workloadEnvironmentId: "workload-environment-1",
          resolveInstallationContract: async () => ({ contractGeneration: 1 }),
        },
        sessionTokenSigningSecret: "s".repeat(32),
        sessionTokenTtlSeconds: 180,
      }),
    )

    expect(module.clientAuthenticated).toEqual([
      { method: "POST", path: "/oauth/token" },
      { method: "POST", path: "/oauth/session-token/exchange" },
    ])
    expect(module.authAugmentation?.resolveAppToken).toBeTypeOf("function")
    await expect(
      module.authAugmentation?.resolveAppToken({
        request: new Request("http://test/v1/app"),
        env: { DATABASE_URL: "postgres://test" },
        db: {} as never,
        token: "test-token",
      }),
    ).resolves.toBeNull()
  })

  it("composes managed acquisition independently from OAuth authority", async () => {
    const module = await createAppsApiModule(
      context(undefined, {
        deploymentId: "deployment-marketplace-1",
        acquisitionResolver: {
          resolveAcquisitionIntent: async () => null,
          createSetupHandoff: async () => ({
            redirectUrl: "https://app.example.com/setup?code=opaque",
          }),
          notifyInstallationLifecycle: async () => undefined,
          completeInstallationSetup: async () => undefined,
        },
      }),
    )

    expect(module.adminRoutes).toBeDefined()
    expect(module.clientAuthenticated).toBeUndefined()
    if (!module.adminRoutes) throw new Error("apps admin routes are required")

    const transaction = vi.fn(async () => {
      throw new Error("installation transaction reached")
    })
    const app = new Hono()
    app.onError((error, c) => c.json({ error: error.message }, 500))
    app.use("*", async (c, next) => {
      c.set("db" as never, { transaction } as never)
      await next()
    })
    app.route("/", module.adminRoutes)

    const response = await app.request("/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appId: "app-1",
        releaseId: "release-1",
        actorId: "actor-1",
      }),
    })
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "installation transaction reached",
    })
    expect(transaction).toHaveBeenCalledOnce()
  })

  it("keeps prior managed Marketplace ports valid without exposing setup completion", async () => {
    const module = await createAppsApiModule(
      context(undefined, {
        deploymentId: "deployment-marketplace-1",
        acquisitionResolver: {
          resolveAcquisitionIntent: async () => null,
          createSetupHandoff: async () => ({
            redirectUrl: "https://app.example.com/setup?code=opaque",
          }),
          notifyInstallationLifecycle: async () => undefined,
        },
      }),
    )

    const routes = await module.lazyRoutes.load()
    expect(routes.routes).not.toContainEqual(
      expect.objectContaining({
        method: "POST",
        path: "/v1/app/marketplace/setup-completion",
      }),
    )
  })

  it("rejects conflicting managed deployment identities", async () => {
    await expect(
      createAppsApiModule(
        context(
          {
            runtimeAudience: "deployment-auth-1",
            installationAuthority: {
              workloadEnvironmentId: "workload-environment-1",
              resolveInstallationContract: async () => ({ contractGeneration: 1 }),
            },
            sessionTokenSigningSecret: "s".repeat(32),
          },
          {
            deploymentId: "deployment-marketplace-2",
            acquisitionResolver: {
              resolveAcquisitionIntent: async () => null,
              createSetupHandoff: async () => ({
                redirectUrl: "https://app.example.com/setup?code=opaque",
              }),
              notifyInstallationLifecycle: async () => undefined,
              completeInstallationSetup: async () => undefined,
            },
          },
        ),
      ),
    ).rejects.toThrow(/must match/)
  })
})
