import { describe, expect, it, vi } from "vitest"
import { createVoyantGraphRuntime } from "./runtime-lowering.js"
import {
  cloudflareCronTriggersForProductJobs,
  compileCloudflareProductJobSchedules,
  createVoyantWorkerJobHealthReporter,
  createVoyantWorkerJobHost,
  createVoyantWorkerJobHostFromProjectRuntime,
  createVoyantWorkerRuntimeHostPrimitives,
} from "./worker-job-host.js"

const unitId = "@acme/jobs"

function runtime(
  handler: (jobId: string) => void,
  schedule: { cron: string } | { every: string } = { cron: "*/5 * * * *" },
) {
  const jobs = ["acme.first", "acme.second"].map((id) => ({
    unitId,
    declaration: {
      id,
      schedule,
      runtime: { entry: `./${id}`, export: "run" },
    },
    referenceId: `${id}.runtime`,
  }))
  return createVoyantGraphRuntime({
    graphHash: "sha256:worker-jobs",
    entries: Object.fromEntries(
      jobs.map((job) => [
        `${unitId}/${job.declaration.id}`,
        async () => ({ run: () => handler(job.declaration.id) }),
      ]),
    ),
    modules: [
      {
        id: unitId,
        kind: "module",
        packageName: unitId,
        order: 0,
        references: jobs.map((job) => ({
          id: job.referenceId,
          unitId,
          facet: "jobs.runtime" as const,
          entityId: job.declaration.id,
          runtime: job.declaration.runtime,
          importEntry: `${unitId}/${job.declaration.id}`,
        })),
        jobs,
        selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
        routes: [],
      },
    ],
    plugins: [],
  })
}

function dbBackedRuntime(handler: (value: string) => void) {
  const id = "acme.database-job"
  return createVoyantGraphRuntime({
    graphHash: "sha256:worker-db-job",
    entries: {
      [`${unitId}/database-job`]: async () => ({
        run: async (context: {
          getPort<T>(port: { id: string; test(provider: T): void }): Promise<T>
        }) => {
          const database = await context.getPort<{ read(): string }>({
            id: "acme.database",
            test: () => {},
          })
          handler(database.read())
        },
      }),
    },
    modules: [
      {
        id: unitId,
        kind: "module",
        packageName: unitId,
        order: 0,
        runtimePorts: ["acme.database"],
        references: [
          {
            id: `${id}.runtime`,
            unitId,
            facet: "jobs.runtime",
            entityId: id,
            runtime: { entry: "./database-job", export: "run" },
            importEntry: `${unitId}/database-job`,
          },
        ],
        jobs: [
          {
            unitId,
            declaration: {
              id,
              wakeup: true,
              runtime: { entry: "./database-job", export: "run" },
            },
            referenceId: `${id}.runtime`,
          },
        ],
        selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
        routes: [],
      },
    ],
    plugins: [],
  })
}

const inventory = ["acme.first", "acme.second"].map((id) => ({
  id,
  unitId,
  packageName: unitId,
  schedule: { cron: "*/5 * * * *" },
  wakeup: false,
}))

describe("Voyant Worker product job host", () => {
  it("serves the trusted closed inventory and keeps bodyless invocations alive", async () => {
    const run = vi.fn()
    const pending: Promise<unknown>[] = []
    const host = createVoyantWorkerJobHost({
      runtime: runtime(run),
      jobs: inventory,
      originTrustSecret: "secret",
      scheduleAuthority: "cloudflare-cron",
    })
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) }

    const inventoryResponse = await host.fetch(
      new Request("https://worker.test/__voyant/jobs", {
        headers: { "x-voyant-origin-trust": "secret" },
      }),
      context,
    )
    await expect(inventoryResponse?.json()).resolves.toEqual({ provisioning: { jobs: inventory } })

    const response = await host.fetch(
      new Request("https://worker.test/__voyant/jobs/acme.first", {
        method: "POST",
        headers: { "x-voyant-origin-trust": "secret" },
      }),
      context,
    )
    expect(response?.status).toBe(202)
    expect(pending).toHaveLength(1)
    await Promise.all(pending)
    expect(run).toHaveBeenCalledWith("acme.first")
  })

  it("binds the immutable jobs exported by the generated project runtime", () => {
    const primitives = createVoyantWorkerRuntimeHostPrimitives({
      bindings: { database: {} },
      resolveDatabase: (bindings) => bindings.database,
    })
    const host = createVoyantWorkerJobHostFromProjectRuntime(
      {
        graphRuntime: runtime(() => {}),
        productJobs: inventory,
        createRuntimePorts: () => ({}),
      },
      { scheduleAuthority: "managed-http", primitives },
    )
    expect(host.inventory).toEqual(inventory)
  })

  it("composes a DB-backed contributor from Worker bindings and invokes it end to end", async () => {
    const observed = vi.fn()
    const database = { read: () => "from-worker-binding" }
    const primitives = createVoyantWorkerRuntimeHostPrimitives({
      bindings: { DB: database },
      resolveDatabase: (bindings) => bindings.DB,
    })
    const host = createVoyantWorkerJobHostFromProjectRuntime(
      {
        graphRuntime: dbBackedRuntime(observed),
        productJobs: [
          {
            id: "acme.database-job",
            unitId,
            packageName: unitId,
            wakeup: true,
          },
        ],
        createRuntimePorts: ({ primitives: contributorPrimitives }) => ({
          "acme.database": contributorPrimitives.database.resolve(undefined),
        }),
      },
      {
        scheduleAuthority: "managed-http",
        primitives,
        originTrustSecret: "secret",
        jobWakeProducers: [
          {
            id: "worker.database-commit",
            jobIds: ["acme.database-job"],
            guarantee: "durable-work-before-wake",
          },
        ],
      },
    )
    const pending: Promise<unknown>[] = []
    const accepted = await host.fetch(
      new Request("https://worker.test/__voyant/jobs/acme.database-job", {
        method: "POST",
        headers: { "x-voyant-origin-trust": "secret" },
      }),
      { waitUntil: (promise) => pending.push(promise) },
    )
    expect(accepted?.status).toBe(202)
    await Promise.all(pending)
    expect(observed).toHaveBeenCalledWith("from-worker-binding")

    const inventoryResponse = await host.fetch(
      new Request("https://worker.test/__voyant/jobs", {
        headers: { "x-voyant-origin-trust": "secret" },
      }),
      { waitUntil: () => {} },
    )
    await expect(inventoryResponse?.json()).resolves.toMatchObject({
      provisioning: {
        jobWakeProducers: [
          {
            id: "worker.database-commit",
            jobIds: ["acme.database-job"],
            guarantee: "durable-work-before-wake",
          },
        ],
      },
    })
  })

  it("fans one Cron Trigger out to every graph job with that exact cron", async () => {
    const run = vi.fn()
    const pending: Promise<unknown>[] = []
    const host = createVoyantWorkerJobHost({
      runtime: runtime(run),
      jobs: inventory,
      scheduleAuthority: "cloudflare-cron",
    })
    await host.scheduled({ cron: "*/5 * * * *" }, { waitUntil: (promise) => pending.push(promise) })
    await Promise.all(pending)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledWith("acme.first")
    expect(run).toHaveBeenCalledWith("acme.second")
  })

  it("projects only exact UTC cadences to Cron Triggers", () => {
    expect(
      compileCloudflareProductJobSchedules([
        { ...inventory[0]!, schedule: { every: "1m" } },
        { ...inventory[1]!, schedule: { every: "30s" } },
        {
          ...inventory[0]!,
          id: "acme.bucharest",
          schedule: { cron: "0 8 * * *", timezone: "Europe/Bucharest" },
        },
      ]),
    ).toEqual([
      { jobId: "acme.first", owner: "cloudflare-cron", cron: "* * * * *" },
      {
        jobId: "acme.second",
        owner: "managed-http",
        reason: "the every cadence is not exactly representable by a UTC cron trigger",
      },
      {
        jobId: "acme.bucharest",
        owner: "managed-http",
        reason: "Cloudflare Cron Triggers are evaluated in UTC",
      },
    ])
  })

  it("emits a deduplicated trigger list for generated Wrangler config", () => {
    expect(cloudflareCronTriggersForProductJobs(inventory)).toEqual(["*/5 * * * *"])
    expect(() =>
      cloudflareCronTriggersForProductJobs([{ ...inventory[0]!, schedule: { every: "30s" } }]),
    ).toThrow("Cannot generate Cloudflare Cron Triggers for product jobs: acme.first")
  })

  it("fails closed when a self-hosted Cron authority cannot represent a cadence", () => {
    expect(() =>
      createVoyantWorkerJobHost({
        runtime: runtime(() => {}, { every: "30s" }),
        jobs: inventory.map((job) => ({ ...job, schedule: { every: "30s" } })),
        scheduleAuthority: "cloudflare-cron",
      }),
    ).toThrow("Cloudflare cannot represent selected schedules for acme.first")
  })

  it("builds the managed terminal callback from Worker bindings", async () => {
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 204 }))
    const reporter = createVoyantWorkerJobHealthReporter(
      {
        ORIGIN_TRUST_SECRET: "secret",
        VOYANT_CLOUD_PRODUCT_JOB_HEALTH_URL: "https://cloud.test/health",
        VOYANT_CLOUD_WORKLOAD_ENVIRONMENT_ID: "environment-1",
      },
      fetchImplementation,
    )
    await reporter?.({
      jobId: "acme.first",
      status: "succeeded",
      attempts: 1,
      retryExhausted: false,
      finishedAt: "2026-07-21T00:00:00.000Z",
      releaseId: "rel_current",
      executionToken: "00000000-0000-4000-8000-000000000001",
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://cloud.test/health",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"releaseId":"rel_current"'),
      }),
    )
  })
})
