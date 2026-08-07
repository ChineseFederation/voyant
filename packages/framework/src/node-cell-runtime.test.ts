import { describe, expect, it, vi } from "vitest"

import { createVoyantNodeCellRuntime, type VoyantTenantContext } from "./node-cell-runtime.js"
import type { VoyantNodeRuntime, VoyantNodeRuntimeOptions } from "./node-runtime.js"

function context(tenantId: string): VoyantTenantContext {
  return {
    tenantId,
    deploymentId: `deployment-${tenantId}`,
    hostname: `${tenantId}.example.test`,
    env: {
      DATABASE_URL: `postgres://db/${tenantId}`,
      DATABASE_MAX_CONNECTIONS: "2",
      DATABASE_MAX_TENANT_POOLS: "2",
      VOYANT_CLOUD_DEPLOYMENT_ID: `deployment-${tenantId}`,
    },
  }
}

function runtimeOptions(): Omit<VoyantNodeRuntimeOptions, "env"> {
  return {
    graphRuntime: {} as VoyantNodeRuntimeOptions["graphRuntime"],
    jobs: [],
    deployment: { providers: {}, redis: {} },
    deploymentRequirements: { env: [], resources: [] },
  } as unknown as Omit<VoyantNodeRuntimeOptions, "env">
}

describe("createVoyantNodeCellRuntime", () => {
  it("isolates authenticated reads, writes, caches, and jobs across two tenants", async () => {
    const tenants = [context("alpha"), context("beta")]
    const values = new Map<string, string>()
    const caches = new Map<string, string>()
    const jobs = new Map<string, number>()
    const loadRuntime = vi.fn(async (options: VoyantNodeRuntimeOptions) => {
      const deploymentId = String(options.env?.VOYANT_CLOUD_DEPLOYMENT_ID ?? "missing")
      return {
        env: options.env,
        fetch: async (request: Request) => {
          if (request.headers.get("authorization") !== `Bearer ${deploymentId}`) {
            return new Response("unauthorized", { status: 401 })
          }
          const url = new URL(request.url)
          if (url.pathname === "/cache") {
            if (request.method === "POST") caches.set(deploymentId, await request.text())
            return new Response(caches.get(deploymentId) ?? "")
          }
          if (request.method === "POST") values.set(deploymentId, await request.text())
          return new Response(values.get(deploymentId) ?? "")
        },
        jobs: {
          invoke: async () => {
            jobs.set(deploymentId, (jobs.get(deploymentId) ?? 0) + 1)
            return "started"
          },
        },
      } as unknown as VoyantNodeRuntime
    })
    const cell = createVoyantNodeCellRuntime({
      runtime: runtimeOptions(),
      resolver: {
        resolve: async ({ hostname, deploymentId }) =>
          tenants.find(
            (tenant) =>
              (!hostname || tenant.hostname === hostname) &&
              (!deploymentId || tenant.deploymentId === deploymentId),
          ) ?? null,
      },
      loadRuntime,
      maxTenants: 2,
    })

    const request = (tenant: "alpha" | "beta", path: string, init?: RequestInit) =>
      cell.fetch(
        new Request(`https://${tenant}.example.test${path}`, {
          ...init,
          headers: { authorization: `Bearer deployment-${tenant}`, ...init?.headers },
        }),
      )
    expect((await request("alpha", "/value", { method: "POST", body: "alpha-value" })).status).toBe(
      200,
    )
    expect((await request("beta", "/value", { method: "POST", body: "beta-value" })).status).toBe(
      200,
    )
    await request("alpha", "/cache", { method: "POST", body: "alpha-cache" })
    await request("beta", "/cache", { method: "POST", body: "beta-cache" })

    expect(await (await request("alpha", "/value")).text()).toBe("alpha-value")
    expect(await (await request("beta", "/value")).text()).toBe("beta-value")
    expect(await (await request("alpha", "/cache")).text()).toBe("alpha-cache")
    expect(await (await request("beta", "/cache")).text()).toBe("beta-cache")
    await cell.invokeJob("deployment-alpha", "job")
    await cell.invokeJob("deployment-beta", "job")
    expect(jobs).toEqual(
      new Map([
        ["deployment-alpha", 1],
        ["deployment-beta", 1],
      ]),
    )
    expect(loadRuntime).toHaveBeenCalledTimes(2)
  })

  it("fails closed and emits security telemetry for unknown and conflicting mappings", async () => {
    const alpha = context("alpha")
    const telemetry = vi.fn()
    const cell = createVoyantNodeCellRuntime({
      runtime: runtimeOptions(),
      resolver: {
        resolve: async ({ hostname }) =>
          hostname === alpha.hostname ? { ...alpha, deploymentId: "stale-deployment" } : null,
      },
      securityTelemetry: telemetry,
      loadRuntime: vi.fn(),
    })

    expect((await cell.fetch(new Request("https://unknown.example.test/"))).status).toBe(421)
    expect((await cell.fetch(new Request(`https://${alpha.hostname}/`))).status).toBe(421)
    expect(telemetry.mock.calls.map(([event]) => event.type)).toEqual([
      "unknown_mapping",
      "stale_mapping",
    ])
  })

  it("binds managed wake selection to both hostname and deployment identity", async () => {
    const alpha = context("alpha")
    const telemetry = vi.fn()
    const cell = createVoyantNodeCellRuntime({
      runtime: runtimeOptions(),
      resolver: {
        resolve: async ({ hostname, deploymentId }) =>
          hostname === alpha.hostname && deploymentId === alpha.deploymentId ? alpha : null,
      },
      securityTelemetry: telemetry,
      loadRuntime: vi.fn(),
    })
    const response = await cell.fetch(
      new Request("https://alpha.example.test/__voyant/jobs/wake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deploymentId: "deployment-beta",
          jobId: "job",
          eventId: "event",
          idempotencyKey: "key",
        }),
      }),
    )
    expect(response.status).toBe(421)
    expect(telemetry).toHaveBeenCalledWith(expect.objectContaining({ type: "unknown_mapping" }))
  })
})
