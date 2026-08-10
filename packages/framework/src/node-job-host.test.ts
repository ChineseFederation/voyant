// agent-quality: file-size exception -- owner: framework; product-job host inventory, invocation, retry, wake, scheduling, and health cases share one fixture-rich contract suite.
import { describe, expect, it, vi } from "vitest"

import {
  createVoyantNodeJobHost,
  VOYANT_MANAGED_JOB_WAKE_ROUTE,
  VOYANT_PRODUCT_JOB_ROUTE,
} from "./node-job-host.js"
import {
  createVoyantGraphRuntime,
  type VoyantGraphRuntime,
  type VoyantGraphRuntimeJobHandler,
} from "./runtime-lowering.js"

const unitId = "@acme/notifications"
const jobId = "notifications.deliver"

function jobRuntime(
  handler: VoyantGraphRuntimeJobHandler,
  schedule:
    | { every: string | number; overlap?: "skip" | "queue" }
    | { cron: string; timezone?: string } = {
    every: "5m",
    overlap: "queue",
  },
  wakeup = true,
): VoyantGraphRuntime {
  return createVoyantGraphRuntime({
    graphHash: "sha256:job-host",
    entries: { "@acme/notifications/jobs": async () => ({ runJob: handler }) },
    modules: [
      {
        id: unitId,
        kind: "module",
        packageName: unitId,
        order: 0,
        references: [
          {
            id: "notifications-job",
            unitId,
            facet: "jobs.runtime",
            entityId: jobId,
            runtime: { entry: "./jobs", export: "runJob" },
            importEntry: "@acme/notifications/jobs",
          },
        ],
        jobs: [
          {
            unitId,
            declaration: {
              id: jobId,
              ...(wakeup ? { wakeup: true as const } : {}),
              schedule,
              runtime: { entry: "./jobs", export: "runJob" },
            },
            referenceId: "notifications-job",
          },
        ],
        selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
        routes: [],
      },
    ],
    plugins: [],
  })
}

function inventory(
  schedule:
    | { every: string | number; overlap?: "skip" | "queue" }
    | { cron: string; timezone?: string } = {
    every: "5m",
    overlap: "queue",
  },
  wakeup = true,
) {
  return [
    {
      id: jobId,
      unitId,
      packageName: unitId,
      schedule,
      wakeup,
    },
  ]
}

function managedWakeRequest(
  overrides: Partial<{
    deploymentId: string
    jobId: string
    eventId: string
    idempotencyKey: string
  }> = {},
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://operator.test${VOYANT_MANAGED_JOB_WAKE_ROUTE}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-voyant-origin-trust": "secret",
      ...headers,
    },
    body: JSON.stringify({
      deploymentId: "deployment_current",
      jobId,
      eventId: "event_1",
      idempotencyKey: "queue-delivery-1",
      ...overrides,
    }),
  })
}

describe("Voyant Node product job host", () => {
  it("requires exact parity between provisioning.jobs and runtime.jobs", () => {
    expect(() =>
      createVoyantNodeJobHost({
        runtime: jobRuntime(() => {}),
        jobs: [{ ...inventory()[0]!, id: "notifications.detached" }],
      }),
    ).toThrow('provisioning job "notifications.detached" has no matching runtime job')
  })

  it("rejects a durable wake producer for an unknown job", () => {
    expect(() =>
      createVoyantNodeJobHost({
        runtime: jobRuntime(() => {}),
        jobs: inventory(),
        jobWakeProducers: [
          {
            id: "notifications.outbox",
            jobIds: ["notifications.missing"],
            guarantee: "durable-work-before-wake",
          },
        ],
      }),
    ).toThrow('wake producer "notifications.outbox" targets unknown job "notifications.missing"')
  })

  it("rejects a durable wake producer for a non-wakeable job", () => {
    expect(() =>
      createVoyantNodeJobHost({
        runtime: jobRuntime(() => {}, undefined, false),
        jobs: inventory(undefined, false),
        jobWakeProducers: [
          {
            id: "notifications.outbox",
            jobIds: [jobId],
            guarantee: "durable-work-before-wake",
          },
        ],
      }),
    ).toThrow(`wake producer "notifications.outbox" targets non-wakeable job "${jobId}"`)
  })

  it("authenticates fixed payload-free HTTP invocation and returns 202 promptly", async () => {
    let release!: () => void
    const handler = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const reportExecution = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
      reportExecution,
    })
    const endpoint = `https://operator.test${VOYANT_PRODUCT_JOB_ROUTE}/${encodeURIComponent(jobId)}`

    await expect(
      host.handleRequest(new Request(endpoint, { method: "POST" })),
    ).resolves.toMatchObject({
      status: 403,
    })
    await expect(
      host.handleRequest(
        new Request(endpoint, {
          method: "POST",
          headers: {
            "x-voyant-origin-trust": "secret",
            "x-voyant-product-job-release": "rel_current",
          },
        }),
      ),
    ).resolves.toMatchObject({ status: 400 })

    const response = await host.handleRequest(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "x-voyant-origin-trust": "secret",
          "x-voyant-product-job-release": "rel_current",
          "x-voyant-product-job-execution": "00000000-0000-4000-8000-000000000001",
        },
      }),
    )
    expect(response?.status).toBe(202)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    expect(host.health()[0]).toMatchObject({ status: "running", lastSource: "wakeup" })
    release()
    await vi.waitFor(() => expect(host.health()[0]?.status).toBe("succeeded"))
    expect(reportExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseId: "rel_current",
        executionToken: "00000000-0000-4000-8000-000000000001",
      }),
    )
  })

  it("accepts an authenticated managed wake bound to this deployment", async () => {
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
      managedDeploymentId: "deployment_current",
    })

    const response = await host.handleRequest(managedWakeRequest())

    expect(response?.status).toBe(202)
    await expect(response?.json()).resolves.toMatchObject({
      ok: true,
      disposition: "accepted",
      retry: false,
      deploymentId: "deployment_current",
      jobId,
      eventId: "event_1",
    })
    await host.settled(jobId)
    expect(handler).toHaveBeenCalledOnce()
  })

  it("acknowledges an exact managed wake redelivery without repeating work", async () => {
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
      managedDeploymentId: "deployment_current",
    })

    expect((await host.handleRequest(managedWakeRequest()))?.status).toBe(202)
    await host.settled(jobId)
    const duplicate = await host.handleRequest(managedWakeRequest())

    expect(duplicate?.status).toBe(200)
    await expect(duplicate?.json()).resolves.toMatchObject({
      ok: true,
      disposition: "duplicate",
      retry: false,
    })
    expect(handler).toHaveBeenCalledOnce()
  })

  it("permanently rejects a wake for a stale deployment", async () => {
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
      managedDeploymentId: "deployment_current",
    })

    const response = await host.handleRequest(
      managedWakeRequest({ deploymentId: "deployment_stale" }),
    )

    expect(response?.status).toBe(409)
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      disposition: "permanent_failure",
      retry: false,
      code: "deployment_mismatch",
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it("permanently rejects an unknown or non-wakeable job", async () => {
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(() => {}),
      jobs: inventory(),
      originTrustSecret: "secret",
      managedDeploymentId: "deployment_current",
    })

    const response = await host.handleRequest(managedWakeRequest({ jobId: "unknown.job" }))

    expect(response?.status).toBe(404)
    await expect(response?.json()).resolves.toMatchObject({
      disposition: "permanent_failure",
      retry: false,
      code: "unknown_job",
    })
  })

  it("returns a retryable response when managed wake admission fails", async () => {
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
      managedDeploymentId: "deployment_current",
      acquireDistributedLease: async () => {
        throw new Error("lease store unavailable")
      },
    })

    const response = await host.handleRequest(managedWakeRequest())

    expect(response?.status).toBe(503)
    expect(response?.headers.get("retry-after")).toBe("5")
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      disposition: "retryable_failure",
      retry: true,
      code: "temporarily_unavailable",
    })
    expect(handler).not.toHaveBeenCalled()
    // Failed admission did not consume the key.
    expect((await host.handleRequest(managedWakeRequest()))?.status).toBe(503)
  })

  it("authenticates managed wakes and rejects idempotency-key reuse for another event", async () => {
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
      managedDeploymentId: "deployment_current",
    })

    const unauthenticated = await host.handleRequest(
      managedWakeRequest({}, { "x-voyant-origin-trust": "wrong-secret" }),
    )
    expect(unauthenticated?.status).toBe(403)
    await expect(unauthenticated?.json()).resolves.toEqual({
      ok: false,
      disposition: "permanent_failure",
      retry: false,
      code: "authentication_failed",
    })
    expect((await host.handleRequest(managedWakeRequest()))?.status).toBe(202)
    const conflict = await host.handleRequest(managedWakeRequest({ eventId: "event_2" }))
    expect(conflict?.status).toBe(409)
    await expect(conflict?.json()).resolves.toMatchObject({
      code: "idempotency_conflict",
      retry: false,
    })
    await host.settled(jobId)
    expect(handler).toHaveBeenCalledOnce()
  })

  it("accepts an empty streamed invocation body while rejecting actual request input", async () => {
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
    })
    const endpoint = `https://operator.test${VOYANT_PRODUCT_JOB_ROUTE}/${encodeURIComponent(jobId)}`
    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    const emptyResponse = await host.handleRequest(
      new Request(endpoint, {
        method: "POST",
        headers: { "x-voyant-origin-trust": "secret", "transfer-encoding": "chunked" },
        body: emptyStream,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    )
    expect(emptyResponse?.status).toBe(202)
    await host.settled(jobId)
    expect(handler).toHaveBeenCalledOnce()

    const bodyResponse = await host.handleRequest(
      new Request(endpoint, {
        method: "POST",
        headers: { "x-voyant-origin-trust": "secret" },
        body: "unexpected",
      }),
    )
    expect(bodyResponse?.status).toBe(400)

    const queryResponse = await host.handleRequest(
      new Request(`${endpoint}?payload=unexpected`, {
        method: "POST",
        headers: { "x-voyant-origin-trust": "secret" },
      }),
    )
    expect(queryResponse?.status).toBe(400)
    expect(handler).toHaveBeenCalledOnce()
  })

  it("rejects and cancels a large invocation stream without waiting for EOF", async () => {
    const handler = vi.fn(async () => {})
    const cancel = vi.fn()
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      originTrustSecret: "secret",
    })
    const endpoint = `https://operator.test${VOYANT_PRODUCT_JOB_ROUTE}/${encodeURIComponent(jobId)}`
    const neverEndingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
      cancel,
    })

    const response = await host.handleRequest(
      new Request(endpoint, {
        method: "POST",
        headers: { "x-voyant-origin-trust": "secret", "transfer-encoding": "chunked" },
        body: neverEndingStream,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    )

    expect(response?.status).toBe(400)
    expect(cancel).toHaveBeenCalledOnce()
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns the closed managed-registration inventory envelope", async () => {
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(() => {}),
      jobs: inventory(),
      originTrustSecret: "secret",
    })
    const response = await host.handleRequest(
      new Request(`https://operator.test${VOYANT_PRODUCT_JOB_ROUTE}`, {
        headers: { "x-voyant-origin-trust": "secret" },
      }),
    )
    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({ provisioning: { jobs: inventory() } })
  })

  it("returns wake producer attestations in canonical identity order", async () => {
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(() => {}),
      jobs: inventory(),
      jobWakeProducers: [
        {
          id: "z-last",
          jobIds: [jobId],
          guarantee: "durable-work-before-wake",
        },
        {
          id: "a-first",
          jobIds: [jobId],
          guarantee: "durable-work-before-wake",
        },
      ],
      originTrustSecret: "secret",
    })
    const response = await host.handleRequest(
      new Request(`https://operator.test${VOYANT_PRODUCT_JOB_ROUTE}`, {
        headers: { "x-voyant-origin-trust": "secret" },
      }),
    )

    await expect(response?.json()).resolves.toEqual({
      provisioning: {
        jobs: inventory(),
        jobWakeProducers: [
          {
            id: "a-first",
            jobIds: [jobId],
            guarantee: "durable-work-before-wake",
          },
          {
            id: "z-last",
            jobIds: [jobId],
            guarantee: "durable-work-before-wake",
          },
        ],
      },
    })
  })

  it("reports terminal health best-effort without repeating completed domain work", async () => {
    const handler = vi.fn(async () => {})
    const reportExecution = vi.fn(async () => {
      throw new Error("control plane unavailable")
    })
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      reportExecution,
    })

    await host.invoke(jobId, "wakeup")
    await vi.waitFor(() => expect(host.health()[0]?.status).toBe("succeeded"))
    expect(handler).toHaveBeenCalledOnce()
    expect(reportExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId,
        status: "succeeded",
        attempts: 1,
        retryExhausted: false,
        finishedAt: expect.any(String),
      }),
    )
    expect(host.health()[0]?.lastReportFailure).toBe("control plane unavailable")
  })

  it("passes concrete deployment bindings to the fixed job runtime", async () => {
    const bindings = { TENANT_ID: "tenant_pro_travel" }
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      bindings,
    })

    await host.invoke(jobId, "wakeup")
    await host.settled(jobId)

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ bindings }))
  })

  it("bounds retries and exposes retry exhaustion without persisting generic runs", async () => {
    const handler = vi.fn(async () => {
      throw new Error("delivery failed")
    })
    const sleep = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      retry: { maxAttempts: 3, initialBackoffMs: 10, maxBackoffMs: 20 },
      sleep,
    })

    await host.invoke(jobId, "wakeup")
    await vi.waitFor(() => expect(host.health()[0]?.retryExhausted).toBe(true))
    expect(handler).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(host.health()[0]).toMatchObject({
      status: "failed",
      attempts: 3,
      lastFailure: "delivery failed",
    })
  })

  it("coalesces overlapping wakeups behind one per-job lease", async () => {
    const releases: Array<() => void> = []
    const handler = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)))
    const host = createVoyantNodeJobHost({ runtime: jobRuntime(handler), jobs: inventory() })

    await expect(host.invoke(jobId, "wakeup")).resolves.toBe("started")
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    await expect(host.invoke(jobId, "wakeup")).resolves.toBe("queued")
    await expect(host.invoke(jobId, "wakeup")).resolves.toBe("queued")
    releases.shift()?.()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
    releases.shift()?.()
  })

  it("reports the newest correlation for a coalesced execution", async () => {
    const releases: Array<() => void> = []
    const reports: Array<{ releaseId?: string; executionToken?: string }> = []
    const handler = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)))
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      reportExecution: async (report) => {
        reports.push(report)
      },
    })
    const first = {
      releaseId: "rel_current",
      executionToken: "00000000-0000-4000-8000-000000000001",
    }
    const queued = {
      releaseId: "rel_current",
      executionToken: "00000000-0000-4000-8000-000000000002",
    }
    const laterCoalesced = {
      releaseId: "rel_current",
      executionToken: "00000000-0000-4000-8000-000000000003",
    }

    await expect(host.invoke(jobId, "wakeup", first)).resolves.toBe("started")
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    await expect(host.invoke(jobId, "wakeup", queued)).resolves.toBe("queued")
    await expect(host.invoke(jobId, "wakeup", laterCoalesced)).resolves.toBe("queued")
    await expect(host.invoke(jobId, "wakeup")).resolves.toBe("queued")
    releases.shift()?.()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
    releases.shift()?.()
    await vi.waitFor(() => expect(reports).toHaveLength(2))
    expect(reports).toEqual([
      expect.objectContaining(first),
      expect.objectContaining(laterCoalesced),
    ])
  })

  it("runs one documented startup safety sweep before every-cadence polling", async () => {
    vi.useFakeTimers()
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      schedulerPollMs: 1_000,
      now: () => new Date(Date.now()),
    })

    host.start()
    await vi.runAllTicks()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    expect(host.health()[0]?.lastSource).toBe("recovery")
    await vi.advanceTimersByTimeAsync(300_000)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
    host.stop()
    vi.useRealTimers()
  })

  it("matches managed cadence parsing for decimals and rejects ambiguous zero cadences", () => {
    const decimalSchedule = { every: 0.5 }
    const decimal = createVoyantNodeJobHost({
      runtime: jobRuntime(() => {}, decimalSchedule),
      jobs: inventory(decimalSchedule),
    })
    expect(() => decimal.start()).not.toThrow()
    decimal.stop()

    for (const every of ["5 m", "PT", "PT0S"]) {
      const schedule = { every }
      const host = createVoyantNodeJobHost({
        runtime: jobRuntime(() => {}, schedule),
        jobs: inventory(schedule),
      })
      expect(() => host.start()).toThrow(/unsupported every cadence/)
    }
  })

  it("arms a deferred wake and lets the earliest request win", async () => {
    vi.useFakeTimers()
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({ runtime: jobRuntime(handler), jobs: inventory() })
    const start = Date.now()

    expect(host.wakeAt(jobId, new Date(start + 600_000))).toBe("armed")
    // A later instant must not push the pending wake out.
    expect(host.wakeAt(jobId, new Date(start + 900_000))).toBe("pending-earlier")
    // An earlier one must.
    expect(host.wakeAt(jobId, new Date(start + 120_000))).toBe("armed")

    await vi.advanceTimersByTimeAsync(119_000)
    expect(handler).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    expect(host.health()[0]?.lastSource).toBe("wakeup")

    // The armed wake is spent, so the next request arms afresh.
    expect(host.wakeAt(jobId, new Date(Date.now() + 60_000))).toBe("armed")
    host.stop()
    vi.useRealTimers()
  })

  it("floors an already-due wake instead of spinning against its own clock", async () => {
    vi.useFakeTimers()
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      minimumWakeDelayMs: 1_000,
    })

    expect(host.wakeAt(jobId, new Date(Date.now() - 60_000))).toBe("armed")
    await vi.advanceTimersByTimeAsync(999)
    expect(handler).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    host.stop()
    vi.useRealTimers()
  })

  it("declines a wake past the horizon and leaves it to the declared cadence", () => {
    vi.useFakeTimers()
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler),
      jobs: inventory(),
      maximumWakeHorizonMs: 60_000,
    })

    expect(host.wakeAt(jobId, new Date(Date.now() + 60_001))).toBe("beyond-horizon")
    host.stop()
    vi.useRealTimers()
  })

  it("drops armed wakes when the host stops", async () => {
    vi.useFakeTimers()
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({ runtime: jobRuntime(handler), jobs: inventory() })

    expect(host.wakeAt(jobId, new Date(Date.now() + 30_000))).toBe("armed")
    host.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("refuses to wake a job the graph did not declare wakeable", () => {
    const schedule = { every: "5m", overlap: "queue" } as const
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(() => {}, schedule, false),
      jobs: inventory(schedule, false),
    })

    expect(() => host.wakeAt(jobId, new Date(Date.now() + 30_000))).toThrow(
      /is not declared wakeup: true/,
    )
    expect(() => host.wakeAt("notifications.absent", new Date())).toThrow(
      /is not selected by the graph/,
    )
  })

  it("uses standard cron OR semantics for restricted day-of-month and day-of-week", async () => {
    vi.useFakeTimers()
    let current = new Date("2026-07-06T11:59:00.000Z") // Monday, but not day 7.
    const schedule = { cron: "0 12 7 * 1", timezone: "UTC" }
    const handler = vi.fn(async () => {})
    const host = createVoyantNodeJobHost({
      runtime: jobRuntime(handler, schedule),
      jobs: inventory(schedule),
      schedulerPollMs: 1_000,
      now: () => current,
    })

    host.start()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    current = new Date("2026-07-06T12:00:00.000Z")
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
    host.stop()
    vi.useRealTimers()
  })
})
