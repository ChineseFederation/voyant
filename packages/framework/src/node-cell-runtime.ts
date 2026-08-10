import { acquireNodeDatabase } from "@voyant-travel/db/runtime"
import {
  type CreateNodeServerOptions,
  createNodeServer,
  type ExecutionContextLike,
  type NodeServerHandle,
} from "@voyant-travel/runtime-core"

import { VOYANT_MANAGED_JOB_WAKE_ROUTE } from "./node-job-host.js"
import {
  loadVoyantNodeRuntime,
  type VoyantNodeRuntime,
  type VoyantNodeRuntimeEnv,
  type VoyantNodeRuntimeOptions,
} from "./node-runtime.js"

export interface VoyantTenantContext {
  readonly tenantId: string
  readonly deploymentId: string
  readonly hostname: string
  /** Digest of the complete canonical server-side context, including assignment generation. */
  readonly contextVersion: string
  /** Server-only bindings. They must never be serialized into a response or edge manifest. */
  readonly env: VoyantNodeRuntimeEnv
}

export const VOYANT_TENANT_CONTEXT_VERSION_PATTERN = /^sha256:[0-9a-f]{64}$/u

export interface VoyantTenantContextResolver {
  resolve(input: {
    readonly hostname?: string
    readonly deploymentId?: string
  }): Promise<VoyantTenantContext | null>
}

export interface VoyantNodeCellSecurityEvent {
  type: "unknown_mapping" | "conflicting_mapping" | "stale_mapping" | "capacity_exhausted"
  hostname?: string
  deploymentId?: string
}

export interface VoyantNodeCellRuntimeOptions {
  resolver: VoyantTenantContextResolver
  runtime: Omit<VoyantNodeRuntimeOptions, "env">
  maxTenants?: number
  idleTenantMs?: number
  securityTelemetry?: (event: VoyantNodeCellSecurityEvent) => void
  loadRuntime?: typeof loadVoyantNodeRuntime
}

export interface VoyantNodeCellRuntime {
  fetch(request: Request, ctx?: ExecutionContextLike): Promise<Response>
  invokeJob(deploymentId: string, jobId: string): Promise<unknown>
  dispatchSchedule(
    deploymentId: string,
    event: { scheduleId?: string; cron?: string },
  ): Promise<void>
  start(options?: Partial<CreateNodeServerOptions<VoyantNodeRuntimeEnv>>): NodeServerHandle
}

interface ResidentTenant {
  context: VoyantTenantContext
  runtime: VoyantNodeRuntime
  active: number
  lastUsedAt: number
  releaseDatabase: () => void
}

interface PendingTenant {
  context: VoyantTenantContext
  promise: Promise<ResidentTenant>
}

/**
 * Host a bounded set of database-per-tenant runtimes in one regional process.
 * Domain code still sees one deployment-static environment and one database;
 * tenant selection happens before its app, registries, caches, auth, or jobs run.
 */
export function createVoyantNodeCellRuntime(
  options: VoyantNodeCellRuntimeOptions,
): VoyantNodeCellRuntime {
  const maximum = positiveInteger(options.maxTenants, 16, "maxTenants")
  const idleMs = positiveInteger(options.idleTenantMs, 300_000, "idleTenantMs")
  const residents = new Map<string, ResidentTenant>()
  const pending = new Map<string, PendingTenant>()
  const databaseOwners = new Map<string, string>()
  const load = options.loadRuntime ?? loadVoyantNodeRuntime

  const report = (event: VoyantNodeCellSecurityEvent) => options.securityTelemetry?.(event)

  const resolveContext = async (identity: {
    hostname?: string
    deploymentId?: string
  }): Promise<VoyantTenantContext | null> => {
    const resolved = await options.resolver.resolve(identity)
    if (!resolved) {
      report({ type: "unknown_mapping", ...identity })
      return null
    }
    let context: VoyantTenantContext
    try {
      context = freezeContext(resolved)
    } catch {
      report({ type: "stale_mapping", ...identity })
      return null
    }
    if (
      identity.hostname &&
      normalizeHostname(context.hostname) !== normalizeHostname(identity.hostname)
    ) {
      report({ type: "conflicting_mapping", ...identity })
      return null
    }
    if (identity.deploymentId && context.deploymentId !== identity.deploymentId) {
      report({ type: "conflicting_mapping", ...identity })
      return null
    }
    if (context.env.VOYANT_CLOUD_DEPLOYMENT_ID !== context.deploymentId) {
      report({ type: "stale_mapping", ...identity })
      return null
    }
    return context
  }

  const residentFor = async (context: VoyantTenantContext): Promise<ResidentTenant> => {
    const current = residents.get(context.deploymentId)
    if (current) {
      if (!sameContext(current.context, context)) {
        report({
          type: "conflicting_mapping",
          hostname: context.hostname,
          deploymentId: context.deploymentId,
        })
        throw new CellAdmissionError("Tenant mapping changed while resident.")
      }
      current.lastUsedAt = Date.now()
      return current
    }
    const loading = pending.get(context.deploymentId)
    if (loading) {
      if (!sameContext(loading.context, context)) {
        report({
          type: "conflicting_mapping",
          hostname: context.hostname,
          deploymentId: context.deploymentId,
        })
        throw new CellAdmissionError("Tenant mapping changed while loading.")
      }
      return loading.promise
    }
    const contextDatabase = databaseIdentity(context.env)
    const databaseOwner = databaseOwners.get(contextDatabase)
    if (databaseOwner && databaseOwner !== context.deploymentId) {
      report({
        type: "conflicting_mapping",
        hostname: context.hostname,
        deploymentId: context.deploymentId,
      })
      throw new CellAdmissionError("Two tenants resolved to the same database identity.")
    }
    databaseOwners.set(contextDatabase, context.deploymentId)
    const promise = (async () => {
      evictIdle(residents, idleMs, (resident) => {
        databaseOwners.delete(databaseIdentity(resident.context.env))
      })
      if (residents.size >= maximum) {
        const candidate = leastRecentlyUsedIdle(residents)
        if (!candidate) {
          report({ type: "capacity_exhausted", deploymentId: context.deploymentId })
          throw new CellAdmissionError("Tenant runtime capacity is exhausted.")
        }
        residents.delete(candidate.context.deploymentId)
        databaseOwners.delete(databaseIdentity(candidate.context.env))
        candidate.releaseDatabase()
      }
      let database: ReturnType<typeof acquireNodeDatabase> | undefined
      let runtime: VoyantNodeRuntime
      try {
        database = acquireNodeDatabase(context.env)
        runtime = await load({ ...options.runtime, env: context.env })
      } catch (error) {
        databaseOwners.delete(contextDatabase)
        database?.release()
        throw error
      }
      if (!database) throw new CellAdmissionError("Tenant database pool was not acquired.")
      const resident = {
        context,
        runtime,
        active: 0,
        lastUsedAt: Date.now(),
        releaseDatabase: database.release,
      }
      residents.set(context.deploymentId, resident)
      return resident
    })()
    pending.set(context.deploymentId, { context, promise })
    try {
      return await promise
    } finally {
      pending.delete(context.deploymentId)
    }
  }

  const withTenant = async <T>(
    context: VoyantTenantContext,
    operation: (runtime: VoyantNodeRuntime) => Promise<T>,
  ): Promise<T> => {
    const resident = await residentFor(context)
    resident.active += 1
    try {
      return await operation(resident.runtime)
    } finally {
      resident.active -= 1
      resident.lastUsedAt = Date.now()
    }
  }

  const fetch = async (request: Request, ctx?: ExecutionContextLike): Promise<Response> => {
    try {
      const url = new URL(request.url)
      const hostname = normalizeHostname(url.hostname)
      const deploymentId =
        url.pathname === VOYANT_MANAGED_JOB_WAKE_ROUTE
          ? await managedWakeDeploymentId(request)
          : undefined
      const context = await resolveContext({ hostname, ...(deploymentId ? { deploymentId } : {}) })
      if (!context) return admissionFailure(421, "tenant_mapping_rejected")
      return await withTenant(context, (runtime) =>
        Promise.resolve(runtime.fetch(request, context.env, ctx)),
      )
    } catch (error) {
      if (error instanceof CellAdmissionError)
        return admissionFailure(503, "tenant_capacity_unavailable")
      throw error
    }
  }

  return {
    fetch,
    invokeJob: async (deploymentId, jobId) => {
      const context = await resolveContext({ deploymentId })
      if (!context) throw new CellAdmissionError("Tenant mapping rejected.")
      return withTenant(context, (runtime) => runtime.jobs.invoke(jobId, "wakeup"))
    },
    dispatchSchedule: async (deploymentId, event) => {
      const context = await resolveContext({ deploymentId })
      if (!context) throw new CellAdmissionError("Tenant mapping rejected.")
      await withTenant(context, (runtime) => runtime.jobs.dispatchSchedule(event))
    },
    start: (serverOptions = {}) =>
      createNodeServer({
        fetch: (request, _env, ctx) => fetch(request, ctx),
        env: {} as VoyantNodeRuntimeEnv,
        port: 8080,
        ...serverOptions,
      }),
  }
}

class CellAdmissionError extends Error {}

function freezeContext(context: VoyantTenantContext): VoyantTenantContext {
  return Object.freeze({
    tenantId: required(context.tenantId, "tenantId"),
    deploymentId: required(context.deploymentId, "deploymentId"),
    hostname: normalizeHostname(required(context.hostname, "hostname")),
    contextVersion: immutableContextVersion(context.contextVersion),
    env: Object.freeze({ ...context.env }),
  })
}

function sameContext(left: VoyantTenantContext, right: VoyantTenantContext): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.deploymentId === right.deploymentId &&
    left.hostname === right.hostname &&
    left.contextVersion === right.contextVersion &&
    left.env.DATABASE_URL === right.env.DATABASE_URL &&
    left.env.DATABASE_URL_DIRECT === right.env.DATABASE_URL_DIRECT
  )
}

function databaseIdentity(env: VoyantNodeRuntimeEnv): string {
  return `${env.DATABASE_URL_DIRECT?.trim() ?? env.DATABASE_URL?.trim() ?? ""}\0${env.DATABASE_URL_REPLICAS?.trim() ?? ""}`
}

function evictIdle(
  residents: Map<string, ResidentTenant>,
  idleMs: number,
  onEvict: (resident: ResidentTenant) => void,
): void {
  const cutoff = Date.now() - idleMs
  for (const [key, resident] of residents) {
    if (resident.active === 0 && resident.lastUsedAt <= cutoff) {
      residents.delete(key)
      onEvict(resident)
      resident.releaseDatabase()
    }
  }
}

function leastRecentlyUsedIdle(residents: Map<string, ResidentTenant>): ResidentTenant | undefined {
  return [...residents.values()]
    .filter((entry) => entry.active === 0)
    .sort((left, right) => left.lastUsedAt - right.lastUsedAt)[0]
}

async function managedWakeDeploymentId(request: Request): Promise<string | undefined> {
  if (request.method !== "POST") return undefined
  try {
    const body = (await request.clone().json()) as { deploymentId?: unknown }
    return typeof body.deploymentId === "string" ? body.deploymentId.trim() : undefined
  } catch {
    return undefined
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/u, "")
}

function required(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Tenant context ${name} is required.`)
  return normalized
}

function immutableContextVersion(value: string): string {
  const normalized = required(value, "contextVersion")
  if (!VOYANT_TENANT_CONTEXT_VERSION_PATTERN.test(normalized)) {
    throw new Error("Tenant context contextVersion must be an exact sha256 digest.")
  }
  return normalized
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const selected = value ?? fallback
  if (!Number.isSafeInteger(selected) || selected < 1)
    throw new Error(`${name} must be a positive integer.`)
  return selected
}

function admissionFailure(status: number, code: string): Response {
  return Response.json({ status: "permanent_failure", code }, { status })
}
