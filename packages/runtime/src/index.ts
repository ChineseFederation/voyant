import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

import { serveAdminHost } from "@voyant-travel/admin-host/serve"
import {
  type AppsWebhookDeliveryRuntime,
  appsWebhookDeliveryRuntimePort,
  createAppWebhookDeliveryEnqueuer,
  createAppWebhookDeliveryWorker,
} from "@voyant-travel/apps"
import {
  type CustomerBusinessAccountOnboardingRuntimeProvider,
  customerBusinessAccountOnboardingRuntimePort,
} from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import {
  type CustomerAuthRuntimeContext,
  createOperatorAuthNodeRuntime,
  type OperatorAuthEmailSender,
  type OperatorAuthNodeEnv,
} from "@voyant-travel/auth/node-runtime"
import { createHttpDocumentRendererFromEnv, type EventEnvelope } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { resolveNodeDatabase } from "@voyant-travel/db/runtime"
import type { VoyantGraphRuntimePorts } from "@voyant-travel/framework"
import {
  createVoyantNodeEnv,
  createVoyantNodeRuntimeHostPrimitives,
  loadVoyantNodeRuntime,
  resolveVoyantNodeProviderPlan,
  type VoyantNodeRuntime,
  type VoyantNodeRuntimeEnv,
  validateVoyantNodeProviderPlanEnv,
} from "@voyant-travel/framework/node-runtime"
import { consoleReporter } from "@voyant-travel/hono/observability/reporter"
import { createNodeServer, type NodeServerHandle } from "@voyant-travel/runtime-core"
import type { StorageProviderResolver } from "@voyant-travel/storage/types"
import { renderPdfDocument } from "@voyant-travel/utils/pdf-renderer"
import {
  createWebhookDeliveryWorker,
  resolveOutboundWebhookDeliveryEnqueuer,
} from "@voyant-travel/webhook-delivery"
import {
  createPostgresWebhookDeliveryEnqueuer,
  createPostgresWebhookDeliveryStore,
} from "@voyant-travel/webhook-delivery/postgres"
import {
  createAppWebhookDeliveryLoop,
  createWebhookDeliveryLoop,
} from "./app-webhook-delivery-loop.js"
import { requireVoyantAuthEnv } from "./auth-env.js"
import { resolveVoyantCloudAuthEmailSender } from "./cloud-auth-email.js"
import {
  resolveAdmittedHostRuntimePorts as admitHostPorts,
  createVoyantDeploymentResources,
  resolveSelectedGraphProviderPorts,
  resolveSelectedGraphRuntimeProviders,
} from "./deployment-resources.js"
import {
  resolveLocalStorageDir,
  withRequiredDocumentFilesystemPersistence,
} from "./filesystem-storage.js"
import {
  type GeneratedProjectRuntime,
  loadGeneratedProjectLinks,
  loadGeneratedProjectRuntime,
  readGeneratedDeploymentGraph,
  resolveAdminAssetsDir,
  resolveGeneratedArtifactRoot,
} from "./project-artifacts.js"
import { loadBuiltProjectStart, startVoyantProjectWithDependencies } from "./project-start.js"
import { resolveCustomStorageResolver } from "./storage-resolver.js"

export {
  type CreateVoyantDeploymentResourcesOptions,
  createVoyantDeploymentResources,
  resolveSelectedGraphProviderPorts,
  resolveSelectedGraphRuntimeProviders,
  type VoyantDeploymentResources,
} from "./deployment-resources.js"
export { resolveVoyantCloudAuthEmailSender }

export interface LoadVoyantProjectOptions {
  projectRoot?: string
  env?: Record<string, string | undefined>
  adminAssetsDir?: string
  preferBuiltAdminAssets?: boolean
  /**
   * Generated server entries inject the statically imported runtime so graph
   * lowering and activation share the bundled framework's private identity.
   */
  generatedProjectRuntime?: GeneratedProjectRuntime
  host?: {
    config?: Readonly<Record<string, unknown>>
    deliverEvent?: (event: unknown, bindings: unknown) => Promise<unknown>
    /** Project-owned provider overrides keyed by their published runtime-port id. */
    runtimePorts?: VoyantGraphRuntimePorts
    storage?: StorageProviderResolver
    /** Resolve a canonical storefront auth origin and server-side provider credentials. */
    resolveCustomerAuthContext?: (
      env: OperatorAuthNodeEnv,
      request: Request,
    ) => CustomerAuthRuntimeContext | Promise<CustomerAuthRuntimeContext>
    /**
     * Authorize a customer-realm cross-origin request for dynamic CORS. Returns
     * the exact request origin to echo, or `null` for static-allowlist fallback.
     */
    resolveCustomerCorsOrigin?: (
      env: OperatorAuthNodeEnv,
      request: Request,
    ) => Promise<string | null>
    /** Project-owned transport for verification codes and password resets. */
    resolveAuthEmailSender?: (env: OperatorAuthNodeEnv) => OperatorAuthEmailSender | null
  }
}

export interface VoyantProjectHost {
  projectRoot: string
  graphHash: string
  runtime: VoyantNodeRuntime
  runtimePorts: VoyantGraphRuntimePorts
  auth: VoyantProjectAuth
  fetch(request: Request): Response | Promise<Response>
  start(options?: { port?: number }): NodeServerHandle
}

export interface VoyantProjectAuth {
  getBootstrapStatusForRequest(request: Request, env: VoyantNodeRuntimeEnv): Promise<unknown>
  getCurrentUserForRequest(request: Request, env: VoyantNodeRuntimeEnv): Promise<unknown>
}

/** Load the generated graph and create the framework-owned Node/admin host. */
export async function loadVoyantProject(
  options: LoadVoyantProjectOptions = {},
): Promise<VoyantProjectHost> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd())
  const artifactRoot = await resolveGeneratedArtifactRoot(projectRoot)
  const generated =
    options.generatedProjectRuntime ?? (await loadGeneratedProjectRuntime(artifactRoot))
  const graph = await readGeneratedDeploymentGraph(artifactRoot, generated)
  const adminAuthProvider = generated.deployment.providers.adminAuth
  const customerAuthProvider = selectedCustomerAuthProvider(
    generated.deployment.providers.customerAuth,
  )
  const authMode = selectedOperatorAuthMode(adminAuthProvider)
  const reporter = consoleReporter()
  const providerPlan = resolveVoyantNodeProviderPlan(generated.deployment.providers)
  const rawEnv = Object.fromEntries(Object.entries(options.env ?? process.env))
  const providerIssues = validateVoyantNodeProviderPlanEnv(providerPlan, rawEnv)
  if (providerIssues.length > 0) {
    throw new Error(
      `Voyant Node provider plan is not ready:\n${providerIssues.map((issue) => `- ${issue}`).join("\n")}`,
    )
  }
  const env = createVoyantNodeEnv(rawEnv, providerPlan)
  const authEnv = requireVoyantAuthEnv(env, authMode, customerAuthProvider)
  const explicitRuntimePorts = admitHostPorts(options.host?.runtimePorts ?? {}, generated)
  const selectedStoragePorts = await resolveSelectedGraphProviderPorts(
    generated.graphRuntime,
    rawEnv,
    {
      includedPorts: ["storage.object"],
      excludedPorts: [
        ...Object.keys(explicitRuntimePorts),
        ...(providerPlan.storage === "custom" && options.host?.storage ? ["storage.object"] : []),
      ],
      deploymentValueAliases: { DATABASE_URL: ["DATABASE_URL_DIRECT"] },
      resolveResource: (resource) =>
        resource.kind === "database" ? resolveOptionalNodeDatabase(rawEnv) : undefined,
    },
  )
  let storage = resolveCustomStorageResolver(
    providerPlan.storage === "custom"
      ? (options.host?.storage ?? selectedStoragePorts["storage.object"])
      : selectedStoragePorts["storage.object"],
  )
  // The local `memory` storage plan keeps bytes in a per-process Map, so uploads
  // vanish on restart while their Postgres rows persist. Mirror them to disk so a
  // self-hosted operator without a configured bucket keeps its media across
  // restarts. (Node-only; the isomorphic storage package must not touch node:fs.)
  if (providerPlan.storage === "memory") {
    storage = await withRequiredDocumentFilesystemPersistence(
      storage,
      resolveLocalStorageDir(rawEnv),
    )
  }
  const selectedProviders = await resolveSelectedGraphRuntimeProviders(
    generated.graphRuntime,
    rawEnv,
    {
      excludedPorts: [...Object.keys(explicitRuntimePorts), "storage.object"],
      deploymentValueAliases: { DATABASE_URL: ["DATABASE_URL_DIRECT"] },
      resolveResource: (resource) => {
        if (resource.kind === "database") return resolveOptionalNodeDatabase(rawEnv)
        if (resource.kind === "document-storage") return storage.resolve("documents")
        if (resource.kind === "document-renderer")
          return createHttpDocumentRendererFromEnv(rawEnv) ?? createBundledDocumentRenderer()
        return undefined
      },
    },
  )
  const selectedProviderPorts = Object.fromEntries(
    await Promise.all(
      selectedProviders.selectedProviders.map(async ({ port }) => [
        port,
        await selectedProviders.getProvider(port),
      ]),
    ),
  )
  const activatedGraphRuntime = await selectedProviders.activateRuntime()
  const providerPorts = {
    ...selectedStoragePorts,
    ...selectedProviderPorts,
    ...explicitRuntimePorts,
  }
  const runtimeProviderPorts = { ...providerPorts, "storage.object": storage }
  const hostDeliverEvent = options.host?.deliverEvent
  const outboundWebhooks = resolveOutboundWebhookDeliveryEnqueuer({
    provider: generated.deployment.providers.outboundWebhooks,
    createPostgres: () =>
      createPostgresWebhookDeliveryEnqueuer({
        resolveDatabase: (bindings) =>
          resolveNodeDatabase(
            bindings as Parameters<typeof resolveNodeDatabase>[0],
          ) as AnyDrizzleDb,
      }),
    ...(hostDeliverEvent
      ? {
          host: {
            enqueue: (event: EventEnvelope, bindings: unknown) => hostDeliverEvent(event, bindings),
          },
        }
      : {}),
  })
  const appWebhookRuntime = providerPorts[appsWebhookDeliveryRuntimePort.id] as
    | AppsWebhookDeliveryRuntime
    | undefined
  const appsSelected = generated.graphRuntime.modules.some(
    (unit) => unit.id === "@voyant-travel/apps" || unit.packageName === "@voyant-travel/apps",
  )
  const operatorWebhooksSelected = generated.graphRuntime.modules.some(
    (unit) =>
      unit.id === "@voyant-travel/webhook-delivery" ||
      unit.packageName === "@voyant-travel/webhook-delivery",
  )
  if (appWebhookRuntime) await appsWebhookDeliveryRuntimePort.test(appWebhookRuntime)
  const appWebhooks =
    appsSelected && appWebhookRuntime
      ? createAppWebhookDeliveryEnqueuer({
          contracts: (generated.graphRuntime.eventCatalog?.events ?? [])
            .filter((event) => event.visibility === "external")
            .map((event) => ({
              eventId: event.id,
              eventType: event.eventType,
              eventVersion: event.version,
              payloadSchema: event.payloadSchema,
            })),
          resolveDatabase: (bindings) =>
            resolveNodeDatabase(
              bindings as Parameters<typeof resolveNodeDatabase>[0],
            ) as AnyDrizzleDb,
          resolveSigningKey: appWebhookRuntime.resolveSigningKey,
        })
      : undefined
  const primitives = createVoyantNodeRuntimeHostPrimitives({
    ...options.host,
    config: {
      ...options.host?.config,
      "deployment.providers.adminAuth": adminAuthProvider,
      "deployment.providers.customerAuth": customerAuthProvider,
    },
    env: authEnv,
    storage,
    deliverEvent: outboundWebhooks
      ? (event, bindings) => outboundWebhooks.enqueue(event as EventEnvelope, bindings)
      : undefined,
  })
  const deploymentResources = createVoyantDeploymentResources({
    primitives,
    providerPorts: runtimeProviderPorts,
    createRuntimePorts: generated.createRuntimePorts,
    outboundWebhooks,
  })
  const customerBusinessAccountOnboarding = deploymentResources.ports[
    customerBusinessAccountOnboardingRuntimePort.id
  ] as CustomerBusinessAccountOnboardingRuntimeProvider | undefined
  if (customerBusinessAccountOnboarding) {
    await customerBusinessAccountOnboardingRuntimePort.test(customerBusinessAccountOnboarding)
  }
  const projectLinks = await loadGeneratedProjectLinks(artifactRoot)
  const authRuntime = createOperatorAuthNodeRuntime({
    accessCatalog: generated.graphRuntime.accessCatalog,
    activeModules: generated.graphRuntime.modules.map((unit) => unit.localId ?? unit.id),
    appName: path.basename(projectRoot),
    authMode,
    reporter,
    ...(customerBusinessAccountOnboarding ? { customerBusinessAccountOnboarding } : {}),
    resolveEmailSender: options.host?.resolveAuthEmailSender ?? resolveVoyantCloudAuthEmailSender,
    ...(options.host?.resolveCustomerAuthContext
      ? { resolveCustomerAuthContext: options.host.resolveCustomerAuthContext }
      : {}),
    ...(options.host?.resolveCustomerCorsOrigin
      ? { resolveCustomerCorsOrigin: options.host.resolveCustomerCorsOrigin }
      : {}),
  })
  const runtime = await loadVoyantNodeRuntime({
    applicationId: path.basename(projectRoot),
    graphRuntime: activatedGraphRuntime,
    jobs: graph.jobs,
    deployment: {
      mode: generated.deployment.mode ?? "self-hosted",
      providers: generated.deployment.providers,
    },
    deploymentRequirements: graph.requirements,
    runtimePorts: deploymentResources.ports,
    resources: deploymentResources.capabilities,
    outboundWebhooks: deploymentResources.outboundWebhooks,
    appWebhooks,
    env: authEnv,
    app: {
      linkDefinitions: projectLinks,
      auth: {
        handler: () => ({
          fetch: (request, requestEnv, ctx) =>
            authRuntime.handler.fetch(
              request,
              requireVoyantAuthEnv(requestEnv),
              toExecutionContext(ctx),
            ),
        }),
        resolve: ({ request, env: requestEnv }) =>
          authRuntime.resolveAuthRequest(request, requireVoyantAuthEnv(requestEnv)),
        hasPermission: ({ request, env: requestEnv }) =>
          authRuntime.hasAuthPermission(request, requireVoyantAuthEnv(requestEnv)),
        resolveCorsOrigin: ({ request, env: requestEnv }) =>
          authRuntime.resolveCustomerCorsOrigin(request, requireVoyantAuthEnv(requestEnv)),
        validateApiKey: ({ env: requestEnv, db, apiKey }) =>
          authRuntime.validateApiTokenAccess(requireVoyantAuthEnv(requestEnv), db, apiKey),
        resolveMcpToken: ({ env: requestEnv, db, token }) =>
          authRuntime.resolveMcpAccessToken(requireVoyantAuthEnv(requestEnv), db, token),
      },
    },
  })
  const createAppWebhookWorkerLoop =
    appsSelected && appWebhookRuntime
      ? () =>
          createAppWebhookDeliveryLoop(
            createAppWebhookDeliveryWorker(resolveNodeDatabase(runtime.env) as AnyDrizzleDb, {
              resolveSigningKey: appWebhookRuntime.resolveSigningKey,
            }),
            {
              onError: (error) =>
                reporter.captureException({
                  requestId: "app-webhook-delivery-worker",
                  app: path.basename(projectRoot),
                  error,
                  context: { operation: "app-webhook-delivery.drain" },
                }),
            },
          )
      : undefined
  const createOperatorWebhookWorkerLoop =
    operatorWebhooksSelected && generated.deployment.providers.outboundWebhooks === "postgres"
      ? () =>
          createWebhookDeliveryLoop(
            createWebhookDeliveryWorker({
              store: createPostgresWebhookDeliveryStore(
                resolveNodeDatabase(runtime.env) as Parameters<
                  typeof createPostgresWebhookDeliveryStore
                >[0],
              ),
            }),
            {
              onError: (error) =>
                reporter.captureException({
                  requestId: "operator-webhook-delivery-worker",
                  app: path.basename(projectRoot),
                  error,
                  context: { operation: "operator-webhook-delivery.drain" },
                }),
            },
          )
      : undefined
  const clientAssetsDir = await resolveAdminAssetsDir(
    projectRoot,
    artifactRoot,
    options.adminAssetsDir,
    options.preferBuiltAdminAssets ??
      (options.env?.NODE_ENV ?? process.env.NODE_ENV) === "production",
  )
  const web = serveAdminHost<VoyantNodeRuntimeEnv>({
    clientAssetsDir,
    app: async (request, bindings, ctx) => {
      if (new URL(request.url).pathname.startsWith("/api")) {
        return runtime.app.fetch(rewriteLegacyMediaRequest(request), bindings, ctx)
      }
      // OAuth discovery must answer at the ORIGIN root, not behind `/api`:
      // an MCP client derives these URLs from the origin alone, before it has
      // any credential or knowledge of our API layout. Handled here, ahead of
      // the SSR handler, which would otherwise return the admin app's HTML.
      const discovery = await authRuntime.resolveOAuthDiscoveryRequest(
        request,
        requireVoyantAuthEnv(bindings),
      )
      if (discovery) return discovery
      const { createAdminSsrHandler } = await import("@voyant-travel/admin-host/ssr")
      return createAdminSsrHandler<VoyantNodeRuntimeEnv>()(request, bindings, ctx)
    },
  })

  const fetch = (request: Request) =>
    web.fetch(request, runtime.env, toExecutionContext(createNoopContext()))

  return {
    projectRoot,
    graphHash: generated.graphHash,
    runtime,
    runtimePorts: deploymentResources.ports,
    auth: {
      getBootstrapStatusForRequest: (request, requestEnv) =>
        authRuntime.getBootstrapStatusForRequest(request, requireVoyantAuthEnv(requestEnv)),
      getCurrentUserForRequest: (request, requestEnv) =>
        authRuntime.getCurrentUserForRequest(request, requireVoyantAuthEnv(requestEnv)),
    },
    fetch,
    start: ({ port } = {}) => {
      const residentServices = [
        createOperatorWebhookWorkerLoop?.(),
        createAppWebhookWorkerLoop?.(),
      ].filter((service) => service !== undefined)
      return createNodeServer<VoyantNodeRuntimeEnv>({
        fetch: (request, env, ctx) => web.fetch(request, env, toExecutionContext(ctx)),
        env: runtime.env,
        port,
        ...(residentServices.length > 0 ? { residentServices } : {}),
        ...(runtime.env.ORIGIN_TRUST_SECRET
          ? { originTrustSecret: runtime.env.ORIGIN_TRUST_SECRET }
          : {}),
      })
    },
  }
}

function selectedOperatorAuthMode(provider: unknown): "local" | "voyant-cloud" {
  if (provider === "better-auth") return "local"
  if (provider === "voyant-cloud") return "voyant-cloud"
  throw new Error(
    `Unsupported deployment.providers.adminAuth value ${JSON.stringify(provider)}. Expected "better-auth" or "voyant-cloud".`,
  )
}

function selectedCustomerAuthProvider(provider: unknown): "better-auth" | "disabled" {
  if (provider === "better-auth" || provider === "disabled") return provider
  throw new Error(
    `Unsupported deployment.providers.customerAuth value ${JSON.stringify(provider)}. Expected "better-auth" or "disabled".`,
  )
}

/** Generic TanStack Start server entry used by a project-owned one-line bootstrap. */
export function createVoyantProjectServerEntry(options: LoadVoyantProjectOptions = {}) {
  let host: Promise<VoyantProjectHost> | undefined
  const load = () => (host ??= loadVoyantProject(options))
  return {
    fetch: (request: Request) => load().then((project) => project.fetch(request)),
    start: async (startOptions: { port?: number } = {}) => (await load()).start(startOptions),
  }
}

export async function startVoyantProject(
  options: LoadVoyantProjectOptions & { port?: number } = {},
): Promise<NodeServerHandle> {
  return startVoyantProjectWithDependencies(options, {
    loadBuiltStart: loadBuiltProjectStart,
    loadProject: loadVoyantProject,
  })
}

function rewriteLegacyMediaRequest(request: Request): Request {
  const url = new URL(request.url)
  if (!url.pathname.startsWith("/api/v1/media/")) return request
  url.pathname = url.pathname.replace("/api/v1/media/", "/api/v1/admin/media/")
  return new Request(url, request)
}

function createNoopContext(): import("@voyant-travel/runtime-core").ExecutionContextLike {
  return { waitUntil: () => undefined }
}

function resolveOptionalNodeDatabase(
  env: Readonly<Record<string, string | undefined>>,
): ReturnType<typeof resolveNodeDatabase> | undefined {
  const databaseUrl = env.DATABASE_URL ?? env.DATABASE_URL_DIRECT
  if (!databaseUrl) return undefined
  return resolveNodeDatabase({
    DATABASE_URL: databaseUrl,
    ...(env.DATABASE_URL_DIRECT ? { DATABASE_URL_DIRECT: env.DATABASE_URL_DIRECT } : {}),
    ...(env.DATABASE_URL_REPLICAS ? { DATABASE_URL_REPLICAS: env.DATABASE_URL_REPLICAS } : {}),
  })
}

function createBundledDocumentRenderer() {
  const backendVersion = "voyant.basic-html-pdf.inter-tight-latin-ext.v1"
  const hostRequire = createRequire(import.meta.url)
  const runtimeRequire = createRequire(hostRequire.resolve("@voyant-travel/runtime"))
  const utilsRequire = createRequire(runtimeRequire.resolve("@voyant-travel/utils/pdf-renderer"))
  const fontkitModule = utilsRequire("@pdf-lib/fontkit") as { default?: unknown }
  const fontkit = (fontkitModule.default ?? fontkitModule) as NonNullable<
    Parameters<typeof renderPdfDocument>[0]["fontkit"]
  >
  const fontPath = runtimeRequire.resolve(
    "@fontsource-variable/inter-tight/files/inter-tight-latin-ext-wght-normal.woff2",
  )
  let fontBytes: Promise<Uint8Array> | undefined
  const loadFontBytes = () => {
    fontBytes ??= readFile(fontPath).then((bytes) => new Uint8Array(bytes))
    return fontBytes
  }
  return {
    name: "voyant-basic-document-renderer",
    async resolveBackendIdentity() {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(backendVersion))
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
      )
    },
    async renderPdf(request: { html: string }) {
      return renderPdfDocument({
        content: request.html,
        fontBytes: await loadFontBytes(),
        fontkit,
        format: "html",
      })
    },
  }
}

let defaultProject: Promise<VoyantProjectHost> | undefined

function loadDefaultProject(): Promise<VoyantProjectHost> {
  if (!defaultProject) defaultProject = loadVoyantProject()
  return defaultProject
}

export async function getVoyantProjectBootstrapStatus(request: Request, env: VoyantNodeRuntimeEnv) {
  return (await loadDefaultProject()).auth.getBootstrapStatusForRequest(request, env)
}

export async function getVoyantProjectCurrentUser(request: Request, env: VoyantNodeRuntimeEnv) {
  return (await loadDefaultProject()).auth.getCurrentUserForRequest(request, env)
}

function toExecutionContext(
  ctx?:
    | import("@voyant-travel/runtime-core").ExecutionContextLike
    | import("@voyant-travel/hono").VoyantExecutionContext,
): import("hono").ExecutionContext {
  return {
    waitUntil: (promise) => ctx?.waitUntil?.(promise),
    passThroughOnException: () => ctx?.passThroughOnException?.(),
    props: undefined,
  }
}
