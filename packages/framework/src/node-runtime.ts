// agent-quality: file-size exception -- this entry is the resident Node runtime
// composition boundary for graph boot, environment bindings, and generic Node
// infrastructure.

import type { ActionLedgerCapabilityRegistry } from "@voyant-travel/action-ledger/capability"
import type { EventEnvelope, VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import {
  createPostgresFixedWindowRateLimitStore,
  createPostgresKvStore,
  resolveNodeDatabase,
} from "@voyant-travel/db/runtime"
import {
  createMemoryRateLimitStore,
  createRedisRateLimitStore,
  type RateLimitStore,
  type VoyantAuthIntegration,
  type VoyantBindings,
  type VoyantDb,
} from "@voyant-travel/hono"
import type { ExtensionFactory, ModuleFactory } from "@voyant-travel/hono/composition"
import {
  type CreateNodeServerOptions,
  composeNodeEnv,
  createMemoryKvNamespace,
  createNodeServer,
  type ExecutionContextLike,
  type KvNamespaceShim,
  type NodeServerHandle,
} from "@voyant-travel/runtime-core"
import {
  readDocumentContentBase64,
  resolveDocumentDownloadUrl,
} from "@voyant-travel/storage/runtime"
import type { StorageProvider, StorageProviderResolver } from "@voyant-travel/storage/types"
import type { KVStore } from "@voyant-travel/utils/cache"
import { createLazyRedisClient, type LazyRedisClient } from "@voyant-travel/utils/redis-client"
import { createRedisKvStore } from "@voyant-travel/utils/redis-kv"
import { createTieredKvStore } from "@voyant-travel/utils/tiered-kv"

import { type CreateVoyantAppConfig, createVoyantApp } from "./create-app.js"
import type {
  VoyantGraphDeploymentRequirements,
  VoyantGraphProvisionedJob,
} from "./deployment-graph.js"
import type {
  VoyantDeploymentEnvRequirement,
  VoyantDeploymentMode,
  VoyantDeploymentProviders,
} from "./deployment-types.js"
import { lowerVoyantGraphActionsToActionLedgerRegistry } from "./graph-action-ledger.js"
import {
  createVoyantNodeJobHost,
  VOYANT_PRODUCT_JOB_ROUTE,
  type VoyantNodeJobHealth,
  type VoyantNodeJobHost,
} from "./node-job-host.js"
import {
  resolveVoyantNodeProviderPlan,
  type VoyantNodeKvProvider,
  type VoyantNodeProviderPlan,
  validateVoyantNodeProviderPlanEnv,
} from "./node-provider-plan.js"
import { createLazyNodeRedisTcpClient } from "./node-redis-client.js"
import { composeVoyantGraphRuntime } from "./runtime-composition.js"
import type { VoyantGraphRuntime } from "./runtime-lowering.js"
import {
  type ResolvedVoyantGraphRuntimeValues,
  resolveVoyantGraphRuntimeValues,
} from "./runtime-values.js"

export interface VoyantNodeRuntimeEnv extends VoyantBindings {
  DATABASE_URL_DIRECT?: string
  DATABASE_URL_REPLICAS?: string
  S3_ENDPOINT?: string
  S3_REGION?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_SESSION_TOKEN?: string
  S3_FORCE_PATH_STYLE?: string
  STORAGE_S3_BACKEND_IDENTITY?: string
  STORAGE_MEDIA_BUCKET?: string
  STORAGE_DOCUMENTS_BUCKET?: string
  MEDIA_PUBLIC_BASE_URL?: string
  API_BASE_URL?: string
  REDIS_URL?: string
  REDIS_NAMESPACE?: string
  RATE_LIMIT_STORE?: RateLimitStore
  VOYANT_ADMIN_AUTH_MODE?: string
  VOYANT_CUSTOMER_AUTH_MODE?: string
  VOYANT_APP_RUNTIME_AUDIENCE?: string
  VOYANT_APP_SESSION_TOKEN_SIGNING_SECRET?: string
  VOYANT_APP_SESSION_TOKEN_TTL_SECONDS?: string
  VOYANT_CLOUD_DEPLOYMENT_ID?: string
  VOYANT_CLOUD_ADMIN_AUTH_START_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_AUDIENCE?: string
  VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN?: string
  SESSION_CLAIMS_ADMIN_SECRET?: string
  SESSION_CLAIMS_CUSTOMER_SECRET?: string
  BETTER_AUTH_ADMIN_SECRET?: string
  BETTER_AUTH_CUSTOMER_SECRET?: string
  VOYANT_CLOUD_PRODUCT_JOB_HEALTH_URL?: string
  VOYANT_CLOUD_WORKLOAD_ENVIRONMENT_ID?: string
  ORIGIN_TRUST_SECRET?: string
  PORT?: string
}

export interface CreateVoyantNodeRuntimeHostPrimitivesOptions {
  env: VoyantNodeRuntimeEnv
  storage?: StorageProviderResolver
  config?: Readonly<Record<string, unknown>>
  deliverEvent?: (event: unknown, bindings: unknown) => Promise<unknown>
}

export class VoyantNodeHostRequirementError extends Error {
  readonly code = "VOYANT_NODE_HOST_REQUIREMENT_MISSING"

  constructor(readonly requirement: string) {
    super(
      `Voyant Node host requirement "${requirement}" is not configured. Provide it through createVoyantNodeRuntimeHostPrimitives().`,
    )
    this.name = "VoyantNodeHostRequirementError"
  }
}

/** Domain-neutral infrastructure supplied to statically selected runtime contributors. */
export function createVoyantNodeRuntimeHostPrimitives(
  options: CreateVoyantNodeRuntimeHostPrimitivesOptions,
): VoyantRuntimeHostPrimitives {
  const fallbackEnv = options.env
  const bindingsEnv = (bindings: unknown): VoyantNodeRuntimeEnv =>
    bindings && typeof bindings === "object" ? (bindings as VoyantNodeRuntimeEnv) : fallbackEnv

  return {
    env: (bindings) => ({ ...bindingsEnv(bindings) }),
    database: {
      resolve: <TDatabase>(bindings: unknown) =>
        asRuntimeDatabase<TDatabase>(resolveDb(bindingsEnv(bindings))),
      fromContext: <TDatabase>(context: unknown) => {
        const candidate = context as {
          env?: VoyantNodeRuntimeEnv
          get?: (key: string) => unknown
        }
        const requestDb = candidate?.get?.("db")
        return (requestDb ?? resolveDb(candidate?.env ?? fallbackEnv)) as TDatabase
      },
      transaction: async (bindings, operation) => {
        const database = resolveDb(bindingsEnv(bindings)) as VoyantDb & {
          transaction<T>(operation: (database: unknown) => Promise<T>): Promise<T>
        }
        return database.transaction(operation)
      },
    },
    storage: {
      resolve: (_bindings, name) => options.storage?.resolve(name) ?? null,
      read: (_bindings, key) =>
        readDocumentContentBase64(options.storage?.resolve("documents") ?? null, key),
      downloadUrl: (bindings, key) =>
        resolveDocumentDownloadUrl(
          bindingsEnv(bindings),
          options.storage?.resolve("documents") ?? null,
          key,
        ),
    },
    events: {
      deliver: (event, bindings) => {
        if (!options.deliverEvent) {
          throw new VoyantNodeHostRequirementError("events.deliver")
        }
        return options.deliverEvent(event, bindings)
      },
    },
    config: {
      read: (bindings, key) =>
        Object.hasOwn(options.config ?? {}, key)
          ? options.config?.[key]
          : Reflect.get(bindingsEnv(bindings), key),
    },
  }
}

function asRuntimeDatabase<TDatabase>(database: VoyantDb): TDatabase {
  return database as TDatabase
}

/** Generic host resources available only to deployment-local factories. */
export type VoyantNodeRuntimeResources = Readonly<Record<string, unknown>>

/** Graph-native deployment settings consumed by the resident Node host. */
export interface VoyantNodeRuntimeDeployment {
  mode: VoyantDeploymentMode
  providers: Readonly<Record<string, string>> &
    Partial<Pick<VoyantDeploymentProviders, "scheduledJobs">>
}

/** Inputs for booting a generated application graph in a resident Node process. */
export interface VoyantNodeRuntimeOptions {
  graphRuntime: VoyantGraphRuntime
  /** Resolved, immutable provisioning.jobs inventory from the admitted graph. */
  jobs: readonly VoyantGraphProvisionedJob[]
  deployment: VoyantNodeRuntimeDeployment
  deploymentRequirements: VoyantGraphDeploymentRequirements
  runtimePorts?: import("./runtime-composition.js").VoyantGraphRuntimePorts
  /**
   * Binds graph-contributed durable event delivery to the composed application
   * bus after boot. The caller owns the concrete runtime port; the generic Node
   * host owns only the event-delivery lifecycle.
   */
  eventDelivery?: {
    bind(deliver: (event: EventEnvelope) => Promise<unknown>): void
  }
  /** Node-owned durable boundary for graph-selected outbound webhook events. */
  outboundWebhooks?: {
    enqueue: (event: EventEnvelope, bindings: unknown) => Promise<unknown>
  }
  /** Node-owned durable boundary for installed-app webhook events. */
  appWebhooks?: {
    enqueue: (event: EventEnvelope, bindings: unknown) => Promise<unknown>
  }
  /** Generic resources available to deployment-local factories. */
  resources?: VoyantNodeRuntimeResources
  applicationId?: string
  env?: Record<string, unknown> | VoyantNodeRuntimeEnv
  auth?: VoyantAuthIntegration<VoyantNodeRuntimeEnv>
  /** @deprecated Use `resources`; package behavior belongs behind `runtimePorts`. */
  providers?: VoyantNodeRuntimeResources
  app?: Partial<
    Omit<CreateVoyantAppConfig<VoyantNodeRuntimeEnv, VoyantNodeRuntimeResources>, "providers">
  >
}

/** A graph-native application runtime hosted by Node. */
export interface VoyantNodeRuntime {
  graphRuntime: VoyantGraphRuntime
  deployment: VoyantNodeRuntimeDeployment
  requirements: VoyantGraphDeploymentRequirements
  env: VoyantNodeRuntimeEnv
  graphValues: ResolvedVoyantGraphRuntimeValues
  app: ReturnType<typeof createVoyantNodeApp>
  actionLedgerCapabilities: ActionLedgerCapabilityRegistry
  jobs: {
    inventory: readonly VoyantGraphProvisionedJob[]
    health: () => readonly VoyantNodeJobHealth[]
    invoke: VoyantNodeJobHost["invoke"]
  }
  fetch: (
    request: Request,
    env?: VoyantNodeRuntimeEnv,
    ctx?: ExecutionContextLike,
  ) => Response | Promise<Response>
  start: (options?: Partial<CreateNodeServerOptions<VoyantNodeRuntimeEnv>>) => NodeServerHandle
}

interface NodeSharedStores {
  CACHE: KVStore
  SHARED_STATE: KVStore
  RATE_LIMIT_STORE: RateLimitStore
}

interface NodeSharedProviderResources {
  redisCacheKv?: KVStore
  redisSharedStateKv?: KVStore
  redisRateLimit?: RateLimitStore
  postgresKv?: KVStore
  postgresRateLimit?: RateLimitStore
}

const MATERIALIZED_NODE_ENVS = new WeakMap<object, string>()

function selectedNodeAuthMode(
  providers: Readonly<Record<string, string>>,
): "local" | "voyant-cloud" {
  const provider = providers.adminAuth
  if (provider === "better-auth") return "local"
  if (provider === "voyant-cloud") return "voyant-cloud"
  throw new Error(
    `Unsupported deployment.providers.adminAuth value ${JSON.stringify(provider)}. Expected "better-auth" or "voyant-cloud".`,
  )
}

function selectedNodeCustomerAuthMode(
  providers: Readonly<Record<string, string>>,
): "better-auth" | "disabled" {
  const provider = providers.customerAuth
  if (provider === "better-auth" || provider === "disabled") return provider
  throw new Error(
    `Unsupported deployment.providers.customerAuth value ${JSON.stringify(provider)}. Expected "better-auth" or "disabled".`,
  )
}

/** Boot a generated application graph without constructing a profile compatibility manifest. */
export async function loadVoyantNodeRuntime(
  options: VoyantNodeRuntimeOptions,
): Promise<VoyantNodeRuntime> {
  const providerPlan = resolveVoyantNodeProviderPlan(options.deployment.providers)
  const providerEnv = {
    ...Object.fromEntries(Object.entries(options.env ?? process.env)),
    VOYANT_ADMIN_AUTH_MODE: selectedNodeAuthMode(options.deployment.providers),
    VOYANT_CUSTOMER_AUTH_MODE: selectedNodeCustomerAuthMode(options.deployment.providers),
  }
  const providerIssues = validateVoyantNodeProviderPlanEnv(providerPlan, providerEnv)
  if (providerIssues.length > 0) {
    throw new Error(`Voyant Node provider plan is not ready:\n${formatIssues(providerIssues)}`)
  }
  const env = createVoyantNodeEnv(providerEnv, providerPlan)
  const requirements = options.deploymentRequirements
  const graphValues = await resolveVoyantGraphRuntimeValues(options.graphRuntime, {
    deploymentValues: toPluginEnvRecord(env),
    deploymentValueAliases: deploymentValueAliases(requirements),
  })
  const activeModules = options.graphRuntime.modules.map((unit) => unit.localId ?? unit.id)
  const auth = options.app?.auth ?? options.auth
  const resources = { ...(options.providers ?? {}), ...(options.resources ?? {}) }
  const runtimePorts = options.runtimePorts ? { ...options.runtimePorts } : undefined
  const graphComposition = await composeVoyantGraphRuntime({
    runtime: options.graphRuntime,
    capabilities: resources,
    ports: runtimePorts,
    outboundWebhooks: options.outboundWebhooks,
    appWebhooks: options.appWebhooks,
  })
  const managedJobHealthReporter = createManagedJobHealthReporter(env)
  const jobHost = createVoyantNodeJobHost({
    runtime: options.graphRuntime,
    jobs: options.jobs,
    bindings: env,
    ...(runtimePorts ? { ports: runtimePorts } : {}),
    ...(env.ORIGIN_TRUST_SECRET ? { originTrustSecret: env.ORIGIN_TRUST_SECRET } : {}),
    ...(managedJobHealthReporter ? { reportExecution: managedJobHealthReporter } : {}),
  })
  const actionLedgerCapabilities = lowerVoyantGraphActionsToActionLedgerRegistry(
    options.graphRuntime,
  )
  assertVoyantNodeRuntimeSupport({
    mode: options.deployment.mode,
    providers: options.deployment.providers,
    providerPlan,
    requirements,
    env,
    hasAuthIntegration: Boolean(auth),
  })
  const applicationId = options.applicationId?.trim() || "application"
  const app = createVoyantNodeApp({
    applicationId,
    activeModules,
    deployment: options.deployment,
    env,
    auth,
    resources,
    app: {
      ...options.app,
      accessCatalog: options.app?.accessCatalog ?? options.graphRuntime.accessCatalog,
      publicPaths: [
        ...(options.app?.publicPaths ?? []),
        ...graphComposition.routePosture.publicPaths,
      ],
      dbTransactionalPaths: [
        ...(options.app?.dbTransactionalPaths ?? []),
        ...graphComposition.routePosture.transactionalPaths,
      ],
      accessResources: [
        ...(options.app?.accessResources ?? []),
        ...graphComposition.accessResources,
      ],
    },
    modules: Object.fromEntries(
      graphComposition.modules.map((module, index) => [
        `selected-graph-module:${index}:${module.module.name}`,
        () => module,
      ]),
    ),
    extensions: Object.fromEntries(
      graphComposition.extensions.map((extension, index) => [
        `selected-graph-extension:${index}:${extension.extension.name}`,
        () => extension,
      ]),
    ),
  })

  options.eventDelivery?.bind(async (envelope) => {
    await app.ready(env)
    if (app.eventBus.deliver) return app.eventBus.deliver(envelope)
    await app.eventBus.emit(envelope.name, envelope.data, envelope.metadata)
  })

  const fetch = async (
    request: Request,
    bindings: VoyantNodeRuntimeEnv = env,
    ctx: ExecutionContextLike = createNoopExecutionContext(),
  ): Promise<Response> => {
    const url = new URL(request.url)
    if (
      url.pathname === VOYANT_PRODUCT_JOB_ROUTE ||
      url.pathname.startsWith(`${VOYANT_PRODUCT_JOB_ROUTE}/`)
    ) {
      const response = await jobHost.handleRequest(request, bindings.ORIGIN_TRUST_SECRET)
      if (response) return response
    }
    return app.fetch(request, bindings, toHonoExecutionContext(ctx))
  }

  return {
    graphRuntime: options.graphRuntime,
    deployment: options.deployment,
    requirements,
    env,
    graphValues,
    app,
    actionLedgerCapabilities,
    jobs: {
      inventory: jobHost.inventory,
      health: jobHost.health,
      invoke: jobHost.invoke,
    },
    fetch,
    start: (serverOptions = {}) =>
      createNodeServer<VoyantNodeRuntimeEnv>({
        fetch,
        scheduled: (event) =>
          jobHost.dispatchSchedule({
            ...(event.scheduleId ? { scheduleId: event.scheduleId } : {}),
            ...(event.cron ? { cron: event.cron } : {}),
          }),
        env,
        port: Number.parseInt(env.PORT ?? "8080", 10),
        ...(env.ORIGIN_TRUST_SECRET ? { originTrustSecret: env.ORIGIN_TRUST_SECRET } : {}),
        ...serverOptions,
        residentServices:
          options.deployment.providers.scheduledJobs === "node-cron"
            ? [jobHost, ...(serverOptions.residentServices ?? [])]
            : serverOptions.residentServices,
      }),
  }
}

function createManagedJobHealthReporter(
  env: VoyantNodeRuntimeEnv,
):
  | ((report: import("./node-job-host.js").VoyantNodeJobExecutionReport) => Promise<void>)
  | undefined {
  const endpoint = env.VOYANT_CLOUD_PRODUCT_JOB_HEALTH_URL?.trim()
  const workloadEnvironmentId = env.VOYANT_CLOUD_WORKLOAD_ENVIRONMENT_ID?.trim()
  const originTrustSecret = env.ORIGIN_TRUST_SECRET?.trim()
  if (!endpoint || !workloadEnvironmentId || !originTrustSecret) return undefined
  return async (report) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-voyant-origin-trust": originTrustSecret,
      },
      body: JSON.stringify({ workloadEnvironmentId, ...report }),
    })
    if (!response.ok) {
      throw new Error(`Managed product job health reporting failed with HTTP ${response.status}.`)
    }
  }
}

export async function startVoyantNodeRuntime(
  options: VoyantNodeRuntimeOptions & {
    server?: Partial<CreateNodeServerOptions<VoyantNodeRuntimeEnv>>
  },
): Promise<NodeServerHandle> {
  const runtime = await loadVoyantNodeRuntime(options)
  return runtime.start(options.server)
}

function deploymentValueAliases(
  requirements: Pick<VoyantGraphDeploymentRequirements, "resources"> | undefined,
): Record<string, string[]> {
  const aliases: Record<string, string[]> = {}
  for (const resource of requirements?.resources ?? []) {
    for (const requirement of resource.env) {
      if (!requirement.aliases?.length) continue
      aliases[requirement.name] = [
        ...new Set([...(aliases[requirement.name] ?? []), ...requirement.aliases]),
      ]
    }
  }
  return aliases
}

export function createVoyantNodeApp(options: {
  applicationId: string
  activeModules: readonly string[]
  deployment: VoyantNodeRuntimeDeployment
  env?: VoyantNodeRuntimeEnv
  auth?: VoyantAuthIntegration<VoyantNodeRuntimeEnv>
  resources?: VoyantNodeRuntimeResources
  /** @deprecated Use `resources`; package behavior belongs behind graph runtime ports. */
  providers?: VoyantNodeRuntimeResources
  app?: Partial<
    Omit<CreateVoyantAppConfig<VoyantNodeRuntimeEnv, VoyantNodeRuntimeResources>, "providers">
  >
  modules?: Record<string, ModuleFactory<VoyantNodeRuntimeResources>>
  extensions?: Record<string, ExtensionFactory<VoyantNodeRuntimeResources>>
}) {
  const auth = options.app?.auth ?? options.auth
  return createVoyantApp<VoyantNodeRuntimeEnv, VoyantNodeRuntimeResources>({
    db: resolveDb,
    dbTransactional: resolveDb,
    outbox: true,
    ...options.app,
    modules: {
      ...(options.app?.modules ?? {}),
      ...(options.modules ?? {}),
    },
    extensions: {
      ...(options.app?.extensions ?? {}),
      ...(options.extensions ?? {}),
    },
    basePath: options.app?.basePath ?? "/api",
    auth,
    providers: { ...(options.providers ?? {}), ...(options.resources ?? {}) },
  })
}

export function createVoyantNodeEnv(
  processEnv: Record<string, unknown> | VoyantNodeRuntimeEnv,
  providerPlan: VoyantNodeProviderPlan = {
    storage: "memory",
    cache: "memory",
    sharedState: "memory",
    rateLimit: "memory",
  },
): VoyantNodeRuntimeEnv {
  const providerPlanKey = nodeProviderPlanKey(providerPlan)
  if (MATERIALIZED_NODE_ENVS.get(processEnv) === providerPlanKey) {
    return processEnv as VoyantNodeRuntimeEnv
  }
  const raw: Record<string, unknown> = Object.fromEntries(Object.entries(processEnv))
  const stringEnv = Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
  const stores = createNodeSharedStores(stringEnv, providerPlan)
  const env = composeNodeEnv<VoyantNodeRuntimeEnv>(stringEnv, {
    kv: {
      CACHE: stores.CACHE,
      SHARED_STATE: stores.SHARED_STATE,
    },
    extra: {
      RATE_LIMIT_STORE: stores.RATE_LIMIT_STORE,
    },
  })
  MATERIALIZED_NODE_ENVS.set(env, providerPlanKey)
  return env
}

function nodeProviderPlanKey(plan: VoyantNodeProviderPlan): string {
  return [plan.storage, plan.cache, plan.sharedState, plan.rateLimit].join("\0")
}

function createNodeSharedStores(
  env: Record<string, string>,
  plan: VoyantNodeProviderPlan,
): NodeSharedStores {
  const l1Cache = createMemoryKvNamespace()
  const l1SharedState = createMemoryKvNamespace()
  const selectedProviders = [plan.cache, plan.sharedState, plan.rateLimit]
  const redisUrl = selectedProviders.includes("redis")
    ? requireNodeEnv(env, "REDIS_URL")
    : undefined
  const redisClient = redisUrl ? createLazyNodeRedisClient(redisUrl) : undefined
  const redisNamespace = redisUrl ? optionalRedisNamespace(env.REDIS_NAMESPACE) : undefined
  const postgresDatabase = selectedProviders.includes("postgres")
    ? resolveProviderDatabase(env)
    : undefined
  const resources: NodeSharedProviderResources = {
    ...(redisUrl
      ? {
          redisCacheKv: createRedisKvStore(redisUrl, {
            client: redisClient,
            keyPrefix: redisNamespace ? redisRoleKeyPrefix(redisNamespace, "cache") : undefined,
          }),
          redisSharedStateKv: createRedisKvStore(redisUrl, {
            client: redisClient,
            keyPrefix: redisNamespace ? redisRoleKeyPrefix(redisNamespace, "state") : undefined,
          }),
          redisRateLimit: createRedisRateLimitStore(redisUrl, {
            client: redisClient,
            keyPrefix: redisNamespace ? redisRoleKeyPrefix(redisNamespace, "rate") : undefined,
          }),
        }
      : {}),
    ...(postgresDatabase
      ? {
          postgresKv: createPostgresKvStore(postgresDatabase),
          postgresRateLimit: createPostgresFixedWindowRateLimitStore(postgresDatabase),
        }
      : {}),
  }
  return {
    CACHE: selectedCacheStore(plan.cache, l1Cache, resources),
    SHARED_STATE: selectedAuthoritativeKvStore(plan.sharedState, l1SharedState, resources),
    RATE_LIMIT_STORE: selectedRateLimitStore(plan.rateLimit, resources),
  }
}

function createLazyNodeRedisClient(redisUrl: string): LazyRedisClient {
  const protocol = redisUrlProtocol(redisUrl)
  if (protocol === "http:" || protocol === "https:") return createLazyRedisClient(redisUrl)
  if (protocol === "redis:" || protocol === "rediss:") return createLazyNodeRedisTcpClient(redisUrl)
  throw new Error(
    "REDIS_URL must be an HTTP(S) Redis REST URL with a token or a redis:// or rediss:// Redis TCP URL.",
  )
}

function selectedCacheStore(
  provider: VoyantNodeKvProvider,
  memory: KvNamespaceShim,
  resources: NodeSharedProviderResources,
): KVStore {
  if (provider === "memory") return memory
  if (provider === "redis") {
    return createTieredKvStore(memory, requireProviderResource(resources.redisCacheKv))
  }
  return createTieredKvStore(memory, requireProviderResource(resources.postgresKv))
}

function selectedAuthoritativeKvStore(
  provider: VoyantNodeKvProvider,
  memory: KvNamespaceShim,
  resources: NodeSharedProviderResources,
): KVStore {
  if (provider === "memory") return memory
  if (provider === "redis") return requireProviderResource(resources.redisSharedStateKv)
  return requireProviderResource(resources.postgresKv)
}

function selectedRateLimitStore(
  provider: VoyantNodeKvProvider,
  resources: NodeSharedProviderResources,
): RateLimitStore {
  if (provider === "memory") return createMemoryRateLimitStore()
  if (provider === "redis") {
    return requireProviderResource(resources.redisRateLimit)
  }
  return requireProviderResource(resources.postgresRateLimit)
}

function requireProviderResource<T>(resource: T | undefined): T {
  if (resource !== undefined) return resource
  throw new Error("Selected Node provider resource was not initialized")
}

function resolveProviderDatabase(env: Record<string, string>): VoyantDb {
  const databaseUrl = env.DATABASE_URL_DIRECT?.trim() || env.DATABASE_URL?.trim()
  if (!databaseUrl || !isPostgresConnectionUrl(databaseUrl)) {
    throw new Error("Postgres Node provider requires DATABASE_URL or DATABASE_URL_DIRECT")
  }
  return resolveDb({ ...env, DATABASE_URL: env.DATABASE_URL ?? databaseUrl })
}

function requireNodeEnv(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim()
  if (value) return value
  throw new Error(`${name} is required by the selected Node provider`)
}

function optionalRedisNamespace(value: string | undefined): string | undefined {
  const namespace = value?.trim()
  if (!namespace) return undefined
  assertValidRedisNamespace(namespace)
  return namespace
}

function redisRoleKeyPrefix(namespace: string, role: "cache" | "state" | "rate"): string {
  assertValidRedisNamespace(namespace)
  return `voyant:v1:${namespace}:${role}:`
}

function assertValidRedisNamespace(namespace: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/u.test(namespace)) {
    throw new Error(
      "REDIS_NAMESPACE must be 1-63 characters of ASCII letters, numbers, underscores, or hyphens, and start with a letter or number.",
    )
  }
}

function isPostgresConnectionUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:"
  } catch {
    return false
  }
}

/**
 * Whether any binding in this plan resolves to Redis.
 *
 * Deliberately NOT "the cache/sharedState/rateLimit group" — those roles are
 * bound independently. Managed binds `cache: redis`, `rateLimit: redis` and
 * `sharedState: postgres`, so a group-wide test over-applies, and a test keyed
 * on `sharedState` alone would never fire there. Legacy stored snapshots also
 * carry `sharedState: redis` from an old backfill, so that role is the least
 * reliable signal of the three.
 */
function bindsRedis(plan: VoyantNodeProviderPlan): boolean {
  return plan.cache === "redis" || plan.sharedState === "redis" || plan.rateLimit === "redis"
}

function assertVoyantNodeRuntimeSupport(options: {
  mode: VoyantDeploymentMode
  providers: Readonly<Record<string, string>>
  providerPlan: VoyantNodeProviderPlan
  requirements: VoyantGraphDeploymentRequirements
  env: VoyantNodeRuntimeEnv
  hasAuthIntegration: boolean
}) {
  const issues = nodeRuntimeEnvIssues(options.requirements, options.env)

  // Gated on the binding that implies it, not on the deployment mode: the
  // voyant-cloud admin-auth provider is externally supplied, so the integration
  // has to be injected. `better-auth` is self-contained and needs nothing.
  if (options.providers.adminAuth === "voyant-cloud" && !options.hasAuthIntegration) {
    issues.push("the voyant-cloud admin-auth provider requires an injected auth integration")
  }

  // Both Redis rules stay gated on the deployment context, and that is correct
  // rather than provisional. They encode "this Redis instance is shared between
  // tenants and reachable over an untrusted network" — which no provider value
  // carries. `cache: "redis"` is equally true of a managed Upstash instance and
  // of a self-hoster's Redis on a private network, and the two have opposite
  // requirements. `allows self-hosted Redis providers to use plaintext TCP
  // without a namespace` in node-runtime.test.ts is the specification for that.
  //
  // REDIS_NAMESPACE additionally cannot be declared unconditionally: the
  // platform injects it only for images advertising `regionalRedisNamespaceV1`,
  // an explicit allowlist rather than a version range, so a blanket requirement
  // would hard-fail boot on managed images outside it (platform#1622).
  //
  // What IS wrong here is the name of the axis. This is not managed-versus-
  // self-hosted; it is shared-untrusted infrastructure versus dedicated. A
  // self-hoster on shared infrastructure would want both of these rules, which
  // the current name makes unthinkable. See voyant#3976 item 1.
  if (options.mode === "managed-cloud" && bindsRedis(options.providerPlan)) {
    if (!options.env.REDIS_NAMESPACE?.trim()) {
      issues.push(
        "managed-cloud Redis cache, shared-state, and rate-limit providers require REDIS_NAMESPACE",
      )
    }
    if (!isSecureRedisUrl(options.env.REDIS_URL)) {
      issues.push(
        "managed-cloud Redis providers require rediss:// for Redis TCP or an HTTPS Redis REST URL with a token",
      )
    }
  }

  if (issues.length > 0) {
    throw new Error(`Voyant Node runtime is not ready to start:\n${formatIssues(issues)}`)
  }
}

function nodeRuntimeEnvIssues(
  requirements: Pick<VoyantGraphDeploymentRequirements, "resources">,
  env: VoyantNodeRuntimeEnv,
): string[] {
  const issues: string[] = []
  for (const resource of requirements.resources) {
    for (const requirement of resource.env) {
      const values = [requirement.name, ...(requirement.aliases ?? [])]
        .map((name) => getEnvValue(env, name))
        .filter(hasValue)
      if (requirement.required && values.length === 0) {
        issues.push(
          `${requirement.kind} ${requirement.name} is required for ${resource.resourceKey}`,
        )
        continue
      }
      const format = requirement.format
      if (format && values.length > 0 && !values.every((value) => hasFormat(value, format))) {
        issues.push(
          `${requirement.kind} ${requirement.name} must be ${formatDescription(format)} for ${resource.resourceKey}`,
        )
      }
    }
  }
  return [...new Set(issues)]
}

function formatIssues(issues: readonly string[]): string {
  return issues.map((issue) => `- ${issue}`).join("\n")
}

function getEnvValue(env: VoyantNodeRuntimeEnv, name: string): unknown {
  return Reflect.get(env, name)
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined
}

function hasFormat(
  value: unknown,
  format: NonNullable<VoyantDeploymentEnvRequirement["format"]>,
): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false
  try {
    const parsed = new URL(value)
    if (format === "postgres-url")
      return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:"
    if (format === "redis-url") return isRedisUrl(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function formatDescription(format: NonNullable<VoyantDeploymentEnvRequirement["format"]>): string {
  if (format === "postgres-url") return "a Postgres URL"
  if (format === "redis-url") return "a Redis REST HTTP(S) URL with a token or Redis TCP URL"
  return "an HTTP(S) URL"
}

function isRedisUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false
  try {
    const protocol = redisUrlProtocol(value)
    if (protocol === "redis:" || protocol === "rediss:") return true
    return isRedisRestUrl(value, { requireHttps: false })
  } catch {
    return false
  }
}

function isSecureRedisUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false
  try {
    const protocol = redisUrlProtocol(value)
    if (protocol === "rediss:") return true
    if (protocol === "redis:") return false
    return isRedisRestUrl(value, { requireHttps: true })
  } catch {
    return false
  }
}

function isRedisRestUrl(value: unknown, options: { requireHttps: boolean }): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false
  const parsed = new URL(value)
  return (
    (parsed.protocol === "https:" || (!options.requireHttps && parsed.protocol === "http:")) &&
    (parsed.password.length > 0 || (parsed.searchParams.get("token")?.length ?? 0) > 0)
  )
}

function redisUrlProtocol(value: string): string {
  return new URL(value).protocol
}

function resolveDb(env: unknown): VoyantDb {
  return resolveNodeDatabase(env as VoyantNodeRuntimeEnv) as VoyantDb
}

export type { StorageProvider, StorageProviderResolver, VoyantNodeProviderPlan }
export { resolveVoyantNodeProviderPlan, validateVoyantNodeProviderPlanEnv }

/**
 * Flatten the runtime env bag (string vars + provider bindings) into a plain
 * record for plugin factories to read secrets/connection config from. A real
 * mapper rather than a cast — the managed env has no index signature.
 */
function toPluginEnvRecord(env: VoyantNodeRuntimeEnv): Record<string, unknown> {
  return Object.fromEntries(Object.entries(env))
}

function createNoopExecutionContext(): ExecutionContextLike {
  return { waitUntil: () => {} }
}

function toHonoExecutionContext(ctx: ExecutionContextLike) {
  return {
    waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
    passThroughOnException: () => ctx.passThroughOnException?.(),
    props: undefined,
  }
}
