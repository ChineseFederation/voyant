import { verifyOriginTrust } from "@voyant-travel/runtime-core"

import type { VoyantGraphProvisionedJob } from "./deployment-graph.js"
import { invokeVoyantGraphJob, type VoyantGraphRuntimePorts } from "./runtime-composition.js"
import type { VoyantGraphRuntime } from "./runtime-lowering.js"

export const VOYANT_PRODUCT_JOB_ROUTE = "/__voyant/jobs"
export const VOYANT_PRODUCT_JOB_RELEASE_HEADER = "x-voyant-product-job-release"
export const VOYANT_PRODUCT_JOB_EXECUTION_HEADER = "x-voyant-product-job-execution"

export type VoyantNodeJobInvocationSource = "schedule" | "wakeup" | "recovery"
export type VoyantNodeJobHealthStatus = "idle" | "running" | "retrying" | "succeeded" | "failed"

export interface VoyantNodeJobHealth {
  id: string
  status: VoyantNodeJobHealthStatus
  attempts: number
  retryExhausted: boolean
  lastSource?: VoyantNodeJobInvocationSource
  lastAttemptAt?: string
  lastSuccessAt?: string
  lastFailureAt?: string
  lastFailure?: string
  lastReportFailureAt?: string
  lastReportFailure?: string
}

export interface VoyantNodeJobExecutionReport {
  jobId: string
  status: "succeeded" | "failed"
  attempts: number
  retryExhausted: boolean
  startedAt?: string
  finishedAt: string
  error?: string
  releaseId?: string
  executionToken?: string
}

export interface VoyantProductJobExecutionCorrelation {
  releaseId: string
  executionToken: string
}

export interface VoyantNodeJobHostRetryOptions {
  maxAttempts?: number
  initialBackoffMs?: number
  maxBackoffMs?: number
}

export interface CreateVoyantNodeJobHostOptions {
  runtime: VoyantGraphRuntime
  /** Immutable host inventory copied from resolved provisioning.jobs. */
  jobs: readonly VoyantGraphProvisionedJob[]
  ports?: VoyantGraphRuntimePorts
  /** Concrete deployment bindings passed to fixed product-job runtimes. */
  bindings?: unknown
  retry?: VoyantNodeJobHostRetryOptions
  now?: () => Date
  sleep?: (milliseconds: number) => Promise<void>
  schedulerPollMs?: number
  /**
   * Floor applied to a deferred wake. Keeps a job that re-arms itself from a
   * timestamp it just acted on from spinning against its own clock.
   */
  minimumWakeDelayMs?: number
  /**
   * Furthest ahead a deferred wake is armed. Beyond it the declared cadence is
   * the cheaper recovery: a resident timer that far out survives nothing a
   * cron tick would not also repair.
   */
  maximumWakeHorizonMs?: number
  /** Required for the fixed internal HTTP invocation surface. */
  originTrustSecret?: string
  /** Best-effort terminal execution reporting; failures never repeat domain work. */
  reportExecution?: (report: VoyantNodeJobExecutionReport) => Promise<void> | void
  /**
   * Optional deployment-owned cluster lease. Without it, host serialization is
   * process-local and resident scheduling is supported only for one replica;
   * domain handlers must still claim their own durable work.
   */
  acquireDistributedLease?: (
    jobId: string,
  ) => Promise<{ release(): Promise<void> | void } | undefined>
}

export interface VoyantNodeJobHost {
  inventory: readonly VoyantGraphProvisionedJob[]
  invoke: (
    jobId: string,
    source: VoyantNodeJobInvocationSource,
    correlation?: VoyantProductJobExecutionCorrelation,
  ) => Promise<"started" | "queued" | "skipped">
  dispatchSchedule: (event: { scheduleId?: string; cron?: string }) => Promise<void>
  /**
   * Arm an in-process wake for a `wakeup: true` job at `at`.
   *
   * Earliest request wins: a job holds at most one armed wake, and a later
   * instant never displaces an earlier one. Returns what the host did so a
   * caller can log it; no caller should branch on delivery, because the
   * declared cadence is what actually guarantees the work runs.
   */
  wakeAt: (jobId: string, at: Date) => "armed" | "pending-earlier" | "beyond-horizon"
  handleRequest: (request: Request, originTrustSecret?: string) => Promise<Response | undefined>
  health: () => readonly VoyantNodeJobHealth[]
  /** Resolve after the current invocation and any coalesced follow-up are idle. */
  settled: (jobId: string) => Promise<void>
  start: () => void
  stop: () => void
}

interface MutableJobHealth extends VoyantNodeJobHealth {}

interface JobExecutionState {
  running?: Promise<void>
  pending: boolean
  pendingSource?: VoyantNodeJobInvocationSource
  pendingCorrelation?: VoyantProductJobExecutionCorrelation
}

/**
 * Host fixed product jobs selected by the resolved graph.
 *
 * The host deliberately retains no run payload or durable work state. Domain
 * records remain authoritative; this layer provides only delivery, bounded
 * retry, in-process overlap protection, cadence recovery, and health signals.
 */
export function createVoyantNodeJobHost(
  options: CreateVoyantNodeJobHostOptions,
): VoyantNodeJobHost {
  const inventory = options.jobs.map((job) => structuredClone(job))
  const jobsById = new Map(inventory.map((job) => [job.id, job]))
  assertRuntimeInventoryParity(options.runtime, inventory)

  const maxAttempts = positiveInteger(options.retry?.maxAttempts ?? 3, "retry.maxAttempts")
  const initialBackoffMs = nonNegativeNumber(
    options.retry?.initialBackoffMs ?? 250,
    "retry.initialBackoffMs",
  )
  const maxBackoffMs = nonNegativeNumber(options.retry?.maxBackoffMs ?? 5_000, "retry.maxBackoffMs")
  const now = options.now ?? (() => new Date())
  const sleep =
    options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const schedulerPollMs = positiveInteger(options.schedulerPollMs ?? 1_000, "schedulerPollMs")
  const minimumWakeDelayMs = nonNegativeNumber(
    options.minimumWakeDelayMs ?? 1_000,
    "minimumWakeDelayMs",
  )
  const maximumWakeHorizonMs = positiveInteger(
    options.maximumWakeHorizonMs ?? 6 * 60 * 60 * 1_000,
    "maximumWakeHorizonMs",
  )
  const states = new Map<string, JobExecutionState>(
    inventory.map((job) => [job.id, { pending: false } satisfies JobExecutionState]),
  )
  const healthById = new Map<string, MutableJobHealth>(
    inventory.map((job) => [
      job.id,
      { id: job.id, status: "idle", attempts: 0, retryExhausted: false } satisfies MutableJobHealth,
    ]),
  )
  const lastCronTick = new Map<string, string>()
  const nextEveryTick = new Map<string, number>()
  const armedWakes = new Map<string, { at: number; timer: ReturnType<typeof setTimeout> }>()
  let timer: ReturnType<typeof setInterval> | undefined

  const run = async (
    jobId: string,
    source: VoyantNodeJobInvocationSource,
    correlation?: VoyantProductJobExecutionCorrelation,
  ): Promise<void> => {
    const health = requireMapValue(healthById, jobId)
    health.lastSource = source
    health.retryExhausted = false
    delete health.lastFailure
    let backoffMs = initialBackoffMs
    const startedAt = now().toISOString()

    const report = async (terminal: VoyantNodeJobExecutionReport): Promise<void> => {
      if (!options.reportExecution) return
      try {
        await options.reportExecution(terminal)
        delete health.lastReportFailure
      } catch (error) {
        health.lastReportFailureAt = now().toISOString()
        health.lastReportFailure = errorMessage(error)
      }
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      health.attempts = attempt
      health.status = attempt === 1 ? "running" : "retrying"
      health.lastAttemptAt = now().toISOString()
      try {
        await invokeVoyantGraphJob(options.runtime, jobId, options.ports, options.bindings)
        health.status = "succeeded"
        health.lastSuccessAt = now().toISOString()
        await report({
          jobId,
          status: "succeeded",
          attempts: attempt,
          retryExhausted: false,
          startedAt,
          finishedAt: health.lastSuccessAt,
          ...correlation,
        })
        return
      } catch (error) {
        const failure = errorMessage(error)
        health.lastFailureAt = now().toISOString()
        health.lastFailure = failure
        if (attempt === maxAttempts) {
          health.status = "failed"
          health.retryExhausted = true
          await report({
            jobId,
            status: "failed",
            attempts: attempt,
            retryExhausted: true,
            startedAt,
            finishedAt: health.lastFailureAt,
            error: failure.slice(0, 2_000),
            ...correlation,
          })
          return
        }
        await sleep(Math.min(backoffMs, maxBackoffMs))
        backoffMs = Math.min(Math.max(backoffMs * 2, 1), maxBackoffMs)
      }
    }
  }

  const begin = (
    jobId: string,
    source: VoyantNodeJobInvocationSource,
    lease?: { release(): Promise<void> | void },
    correlation?: VoyantProductJobExecutionCorrelation,
  ): Promise<void> => {
    const state = requireMapValue(states, jobId)
    const execution = run(jobId, source, correlation).finally(async () => {
      await lease?.release()
      delete state.running
      if (!state.pending) return
      const pendingSource = state.pendingSource ?? "wakeup"
      const pendingCorrelation = state.pendingCorrelation
      state.pending = false
      delete state.pendingSource
      delete state.pendingCorrelation
      await invoke(jobId, pendingSource, pendingCorrelation)
    })
    state.running = execution
    return execution
  }

  const invoke = async (
    jobId: string,
    source: VoyantNodeJobInvocationSource,
    correlation?: VoyantProductJobExecutionCorrelation,
  ): Promise<"started" | "queued" | "skipped"> => {
    const job = jobsById.get(jobId)
    if (!job) {
      throw new Error(`Voyant Node job host: job "${jobId}" is not selected by the graph.`)
    }
    const state = requireMapValue(states, jobId)
    if (state.running) {
      if (job.schedule?.overlap === "queue" || source === "wakeup") {
        state.pending = true
        state.pendingSource = source
        // Cloud replaces its tracked execution token on each post-lease
        // dispatch. The one coalesced follow-up must therefore report the
        // newest correlated claim; an uncorrelated local wake must not erase it.
        state.pendingCorrelation = correlation ?? state.pendingCorrelation
        return "queued"
      }
      return "skipped"
    }
    const distributedLease = await options.acquireDistributedLease?.(jobId)
    if (options.acquireDistributedLease && !distributedLease) return "skipped"
    void begin(jobId, source, distributedLease, correlation)
    return "started"
  }

  const dispatchSchedule = async (event: { scheduleId?: string; cron?: string }): Promise<void> => {
    const job = event.scheduleId
      ? jobsById.get(event.scheduleId)
      : inventory.find(
          (candidate) =>
            candidate.schedule &&
            "cron" in candidate.schedule &&
            candidate.schedule.cron === event.cron,
        )
    if (!job?.schedule) {
      const key = event.scheduleId ?? event.cron ?? "missing"
      throw new Error(`Voyant Node job host: unknown scheduled job "${key}".`)
    }
    await invoke(job.id, "schedule")
  }

  const wakeAt = (jobId: string, at: Date): "armed" | "pending-earlier" | "beyond-horizon" => {
    const job = jobsById.get(jobId)
    if (!job) {
      throw new Error(`Voyant Node job host: job "${jobId}" is not selected by the graph.`)
    }
    if (!job.wakeup) {
      throw new Error(`Voyant Node job host: job "${jobId}" is not declared wakeup: true.`)
    }
    const requestedAt = at.getTime()
    if (!Number.isFinite(requestedAt)) {
      throw new TypeError(`Voyant Node job host: job "${jobId}" was woken at an invalid date.`)
    }
    const current = now().getTime()
    const delayMs = Math.max(requestedAt - current, minimumWakeDelayMs)
    if (delayMs > maximumWakeHorizonMs) return "beyond-horizon"

    const armAt = current + delayMs
    const armed = armedWakes.get(jobId)
    if (armed && armed.at <= armAt) return "pending-earlier"
    if (armed) clearTimeout(armed.timer)

    const wakeTimer = setTimeout(() => {
      armedWakes.delete(jobId)
      void invoke(jobId, "wakeup")
    }, delayMs)
    wakeTimer.unref?.()
    armedWakes.set(jobId, { at: armAt, timer: wakeTimer })
    return "armed"
  }

  const handleRequest = async (
    request: Request,
    requestOriginTrustSecret?: string,
  ): Promise<Response | undefined> => {
    const url = new URL(request.url)
    if (
      url.pathname !== VOYANT_PRODUCT_JOB_ROUTE &&
      !url.pathname.startsWith(`${VOYANT_PRODUCT_JOB_ROUTE}/`)
    )
      return undefined
    const trustSecret = (requestOriginTrustSecret ?? options.originTrustSecret)?.trim()
    if (!trustSecret) {
      return new Response("Product job HTTP invocation requires ORIGIN_TRUST_SECRET", {
        status: 503,
      })
    }
    if (!verifyOriginTrust(request, trustSecret)) {
      return new Response("Forbidden: invalid origin trust", { status: 403 })
    }
    if (url.pathname === VOYANT_PRODUCT_JOB_ROUTE) {
      if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 })
      if (url.search || (await requestHasBodyBytes(request))) {
        return new Response("Product job inventory requests do not accept input", { status: 400 })
      }
      return Response.json({ provisioning: { jobs: inventory } })
    }
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 })
    if (url.search || (await requestHasBodyBytes(request))) {
      return new Response("Product job invocations do not accept request input", { status: 400 })
    }
    const encodedId = url.pathname.slice(VOYANT_PRODUCT_JOB_ROUTE.length + 1)
    if (!encodedId || encodedId.includes("/")) {
      return new Response("Unknown product job", { status: 404 })
    }
    let jobId: string
    try {
      jobId = decodeURIComponent(encodedId)
    } catch {
      return new Response("Unknown product job", { status: 404 })
    }
    const job = jobsById.get(jobId)
    if (!job) return new Response("Unknown product job", { status: 404 })
    const correlation = productJobExecutionCorrelation(request)
    if (correlation instanceof Response) return correlation
    const result = await invoke(jobId, job.wakeup ? "wakeup" : "schedule", correlation)
    return Response.json({ accepted: true, jobId, result }, { status: 202 })
  }

  const pollSchedules = () => {
    const current = now()
    for (const job of inventory) {
      if (!job.schedule) continue
      if (job.schedule.every !== undefined) {
        const next = nextEveryTick.get(job.id)
        if (next === undefined || current.getTime() < next) continue
        nextEveryTick.set(job.id, current.getTime() + everyMilliseconds(job.schedule.every))
        void invoke(job.id, "schedule")
        continue
      }
      const tick = cronTickKey(current, job.schedule.timezone)
      if (
        lastCronTick.get(job.id) === tick ||
        !cronMatches(job.schedule.cron, current, job.schedule.timezone)
      ) {
        continue
      }
      lastCronTick.set(job.id, tick)
      void invoke(job.id, "schedule")
    }
  }

  const start = () => {
    if (timer) return
    const startedAt = now()
    for (const job of inventory) {
      if (!job.schedule) continue
      if (job.schedule.every !== undefined) {
        nextEveryTick.set(job.id, startedAt.getTime() + everyMilliseconds(job.schedule.every))
      } else {
        lastCronTick.set(job.id, cronTickKey(startedAt, job.schedule.timezone))
      }
      void invoke(job.id, "recovery")
    }
    timer = setInterval(pollSchedules, schedulerPollMs)
    timer.unref?.()
  }

  return {
    inventory,
    invoke,
    dispatchSchedule,
    wakeAt,
    handleRequest,
    health: () => inventory.map((job) => ({ ...requireMapValue(healthById, job.id) })),
    settled: async (jobId) => {
      if (!jobsById.has(jobId)) {
        throw new Error(`Voyant Node job host: job "${jobId}" is not selected by the graph.`)
      }
      while (requireMapValue(states, jobId).running) {
        await requireMapValue(states, jobId).running
      }
    },
    start,
    stop: () => {
      if (timer) clearInterval(timer)
      timer = undefined
      for (const { timer: wakeTimer } of armedWakes.values()) clearTimeout(wakeTimer)
      armedWakes.clear()
    },
  }
}

async function requestHasBodyBytes(request: Request): Promise<boolean> {
  if (request.body === null) return false
  const reader = request.body.getReader()
  try {
    const { done } = await reader.read()
    if (done) return false
    void reader.cancel().catch(() => {})
    return true
  } catch {
    // An unreadable stream cannot be validated as the required empty body.
    void reader.cancel().catch(() => {})
    return true
  }
}

function productJobExecutionCorrelation(
  request: Request,
): VoyantProductJobExecutionCorrelation | undefined | Response {
  const releaseId = request.headers.get(VOYANT_PRODUCT_JOB_RELEASE_HEADER)?.trim()
  const executionToken = request.headers.get(VOYANT_PRODUCT_JOB_EXECUTION_HEADER)?.trim()
  if (!releaseId && !executionToken) return undefined
  if (!releaseId || !executionToken) {
    return new Response("Product job execution correlation headers must be paired", {
      status: 400,
    })
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      executionToken,
    )
  ) {
    return new Response("Invalid product job execution token", { status: 400 })
  }
  return { releaseId, executionToken }
}

function assertRuntimeInventoryParity(
  runtime: VoyantGraphRuntime,
  inventory: readonly VoyantGraphProvisionedJob[],
): void {
  const runtimeJobs = [
    ...runtime.modules,
    ...runtime.extensions,
    ...runtime.plugins,
    ...(runtime.adapters ?? []),
    ...(runtime.providerUnits ?? []),
  ].flatMap((unit) =>
    unit.jobs.map((job) => ({
      id: job.declaration.id,
      unitId: unit.id,
      schedule: job.declaration.schedule,
      wakeup: job.declaration.wakeup === true,
    })),
  )
  const runtimeById = new Map(runtimeJobs.map((job) => [job.id, job]))
  const inventoryById = new Map(inventory.map((job) => [job.id, job]))
  for (const job of inventory) {
    const runtimeJob = runtimeById.get(job.id)
    if (
      !runtimeJob ||
      runtimeJob.unitId !== job.unitId ||
      runtimeJob.wakeup !== job.wakeup ||
      JSON.stringify(runtimeJob.schedule) !== JSON.stringify(job.schedule)
    ) {
      throw new Error(
        `Voyant Node job host: provisioning job "${job.id}" has no matching runtime job.`,
      )
    }
  }
  for (const job of runtimeJobs) {
    if (!inventoryById.has(job.id)) {
      throw new Error(
        `Voyant Node job host: runtime job "${job.id}" is absent from provisioning.jobs.`,
      )
    }
  }
}

function everyMilliseconds(value: string | number): number {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value > 0) return value
    throw new Error(
      "Voyant Node job host: job schedule every must be finite and greater than zero.",
    )
  }
  const shorthand = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i.exec(value.trim())
  if (shorthand) {
    const factors = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }
    const milliseconds =
      Number(shorthand[1]) * factors[shorthand[2]!.toLowerCase() as keyof typeof factors]
    if (milliseconds > 0) return milliseconds
  }
  const iso = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(
    value.trim(),
  )
  if (iso) {
    const milliseconds =
      Number(iso[1] ?? 0) * 3_600_000 + Number(iso[2] ?? 0) * 60_000 + Number(iso[3] ?? 0) * 1_000
    if (milliseconds > 0) return milliseconds
  }
  throw new Error(`Voyant Node job host: unsupported every cadence "${value}".`)
}

function cronMatches(expression: string, date: Date, timezone?: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`Voyant Node job host: cron "${expression}" must have five fields.`)
  }
  const parts = zonedDateParts(date, timezone)
  const dayOfMonthMatches = cronFieldMatches(fields[2]!, parts.day, 1, 31)
  const dayOfWeekMatches = cronFieldMatches(fields[4]!, parts.weekday, 0, 7, true)
  const dayMatches =
    fields[2] === "*"
      ? dayOfWeekMatches
      : fields[4] === "*"
        ? dayOfMonthMatches
        : dayOfMonthMatches || dayOfWeekMatches
  return (
    cronFieldMatches(fields[0]!, parts.minute, 0, 59) &&
    cronFieldMatches(fields[1]!, parts.hour, 0, 23) &&
    cronFieldMatches(fields[3]!, parts.month, 1, 12) &&
    dayMatches
  )
}

function cronFieldMatches(
  field: string,
  value: number,
  minimum: number,
  maximum: number,
  sundayAlias = false,
): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/")
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step <= 0) return false
    const [start, end] =
      range === "*"
        ? [minimum, maximum]
        : range!.includes("-")
          ? range!.split("-").map(Number)
          : [Number(range), Number(range)]
    const normalizedValue = sundayAlias && value === 0 && start === 7 ? 7 : value
    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start! >= minimum &&
      end! <= maximum &&
      normalizedValue >= start! &&
      normalizedValue <= end! &&
      (normalizedValue - start!) % step === 0
    )
  })
}

function zonedDateParts(date: Date, timezone?: string) {
  if (!timezone || timezone === "UTC" || timezone === "Etc/UTC") {
    return {
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      weekday: date.getUTCDay(),
    }
  }
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      minute: "numeric",
      hour: "numeric",
      hourCycle: "h23",
      day: "numeric",
      month: "numeric",
      weekday: "short",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return {
    minute: Number(values.minute),
    hour: Number(values.hour),
    day: Number(values.day),
    month: Number(values.month),
    weekday: weekdays[values.weekday!]!,
  }
}

function cronTickKey(date: Date, timezone?: string): string {
  const parts = zonedDateParts(date, timezone)
  return `${parts.month}:${parts.day}:${parts.hour}:${parts.minute}`
}

function positiveInteger(value: number, name: string): number {
  if (Number.isInteger(value) && value > 0) return value
  throw new TypeError(`${name} must be a positive integer.`)
}

function nonNegativeNumber(value: number, name: string): number {
  if (Number.isFinite(value) && value >= 0) return value
  throw new TypeError(`${name} must be a non-negative number.`)
}

function requireMapValue<T>(map: ReadonlyMap<string, T>, key: string): T {
  const value = map.get(key)
  if (value !== undefined) return value
  throw new Error(`Voyant Node job host: unknown job "${key}".`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
