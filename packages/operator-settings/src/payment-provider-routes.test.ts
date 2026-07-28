import { OpenAPIHono } from "@hono/zod-openapi"
import type { ModuleContainer } from "@voyant-travel/core"
import { handleApiError } from "@voyant-travel/hono"
import {
  type PaymentActivationInput,
  type PaymentActivationResult,
  type PaymentProviderRegistry,
  paymentProviderRegistryRuntimePort,
} from "@voyant-travel/payments"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it } from "vitest"

import { mountPaymentProviderRoutes } from "./payment-provider-routes.js"

/** Dummy db — the injected registries below never touch it. */
const db = {} as unknown as PostgresJsDatabase

const disconnectedStatus = {
  activeProviderId: null,
  status: "disconnected" as const,
  mode: null,
  activeConnectionId: null,
  connections: [],
}

type TestEnv = { Variables: { db: PostgresJsDatabase; container?: ModuleContainer } }

/**
 * Build a request app that injects `db` + `container` and mounts the payment
 * routes, mirroring how the operator-settings runtime wires them.
 */
function buildApp(container?: ModuleContainer) {
  const app = new OpenAPIHono<TestEnv>()
  app.use("*", async (c, next) => {
    c.set("db", db)
    if (container) c.set("container", container)
    await next()
  })
  mountPaymentProviderRoutes(app)
  app.onError((error, c) => handleApiError(error, c))
  return app
}

/** A container that resolves the runtime port to the supplied registry. */
function containerWithRegistry(registry: PaymentProviderRegistry): ModuleContainer {
  return {
    has: (id: string) => id === paymentProviderRegistryRuntimePort.id,
    resolve: () => () => registry,
  } as unknown as ModuleContainer
}

function activate(
  app: ReturnType<typeof buildApp>,
  body: unknown,
  env: Record<string, unknown> = {},
) {
  return app.request(
    "/v1/admin/settings/payments/activate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  )
}

describe("POST /v1/admin/settings/payments/activate", () => {
  it("rejects a request missing connectionId", async () => {
    const app = buildApp()
    const res = await activate(app, { providerId: "netopia" })
    expect(res.status).toBe(400)
  })

  it("rejects a request with an empty providerId", async () => {
    const app = buildApp()
    const res = await activate(app, { providerId: "", connectionId: "conn_1" })
    expect(res.status).toBe(400)
  })

  it("delegates to the injected registry and reports success", async () => {
    const seen: PaymentActivationInput[] = []
    const registry: PaymentProviderRegistry = {
      listProviders: async () => [],
      getConnection: async () => disconnectedStatus,
      connect: async () => ({ ok: false, status: disconnectedStatus }),
      beginOnboarding: async () => ({
        ok: false,
        status: disconnectedStatus,
        error: "n/a",
      }),
      disconnect: async () => undefined,
      activate: async (input): Promise<PaymentActivationResult> => {
        seen.push(input)
        return {
          ok: true,
          status: {
            activeProviderId: input.providerId,
            status: "connected",
            mode: "live",
            activeConnectionId: input.connectionId,
          },
          activated: { providerId: input.providerId, connectionId: input.connectionId },
        }
      },
    }

    const app = buildApp(containerWithRegistry(registry))
    const res = await activate(app, { providerId: "netopia", connectionId: "conn_1" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: PaymentActivationResult }
    expect(body.data.ok).toBe(true)
    expect(body.data.activated).toEqual({ providerId: "netopia", connectionId: "conn_1" })
    expect(seen).toEqual([{ providerId: "netopia", connectionId: "conn_1" }])
  })

  it("surfaces an explicit registry rejection without faking success", async () => {
    const registry: PaymentProviderRegistry = {
      listProviders: async () => [],
      getConnection: async () => disconnectedStatus,
      connect: async () => ({ ok: false, status: disconnectedStatus }),
      beginOnboarding: async () => ({ ok: false, status: disconnectedStatus, error: "n/a" }),
      disconnect: async () => undefined,
      activate: async () => ({
        ok: false,
        status: disconnectedStatus,
        error: "This connection isn't ready yet.",
      }),
    }

    const app = buildApp(containerWithRegistry(registry))
    const res = await activate(app, { providerId: "netopia", connectionId: "conn_1" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: PaymentActivationResult }
    expect(body.data.ok).toBe(false)
    expect(body.data.activated).toBeUndefined()
    expect(body.data.error).toContain("ready")
  })

  it("fails closed when the registry does not implement activation", async () => {
    const registry: PaymentProviderRegistry = {
      listProviders: async () => [],
      getConnection: async () => disconnectedStatus,
      connect: async () => ({ ok: false, status: disconnectedStatus }),
      beginOnboarding: async () => ({ ok: false, status: disconnectedStatus, error: "n/a" }),
      disconnect: async () => undefined,
      // no activate()
    }

    const app = buildApp(containerWithRegistry(registry))
    const res = await activate(app, { providerId: "netopia", connectionId: "conn_1" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: PaymentActivationResult }
    expect(body.data.ok).toBe(false)
    expect(body.data.error).toContain("not supported")
  })

  it("falls back to the default self-host registry and fails closed", async () => {
    const app = buildApp()
    const res = await activate(app, { providerId: "netopia", connectionId: "environment" }, {})
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: PaymentActivationResult }
    expect(body.data.ok).toBe(false)
    expect(body.data.activated).toBeUndefined()
  })
})
