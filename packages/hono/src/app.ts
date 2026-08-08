// agent-quality: file-size exception — app.ts is the framework composition root;
// splitting it is intentional follow-up work, not part of voyant#2114.
import { OpenAPIHono } from "@hono/zod-openapi"
import { createContainer, createEventBus, createQueryRunner } from "@voyant-travel/core"
import { createLinkServiceFactory } from "@voyant-travel/db/links"
import type { Context, Hono } from "hono"

import { assembleAnonymousPaths, assembleOptionalCustomerAuthPaths } from "./anonymous-paths.js"
import { composeAuthAugmentations } from "./auth-augmentation.js"
import {
  type ApiBundle,
  type ExpandedApiBundles,
  expandApiBundles,
  isLazyApiBundle,
  type LazyApiBundle,
} from "./bundle.js"
import {
  assembleClientAuthenticatedRoutes,
  matchesClientAuthenticatedRoute,
} from "./client-authenticated-routes.js"
import { type LazyRoutesLoader, mountLazyRoutePaths, mountLazyRoutesAt } from "./lazy-routes.js"
import { mountAuthForwarding } from "./lib/auth-forward.js"
import { createPathDbSelector } from "./lib/db-selector.js"
import { tryGetExecutionCtx } from "./lib/execution-ctx.js"
import { matchesPublicPath, normalizePathname } from "./lib/public-paths.js"
import { requestScopedEventBus } from "./lib/request-event-bus.js"
import { createRequestOutboxStore } from "./lib/request-outbox-store.js"
import { requireAuth } from "./middleware/auth.js"
import {
  DEFAULT_REQUEST_BODY_LIMIT_BYTES,
  MAX_GLOBAL_REQUEST_BODY_BYTES,
  requestBodyLimit,
} from "./middleware/body-size.js"
import { cors } from "./middleware/cors.js"
import { db } from "./middleware/db.js"
import { handleApiError, requestId } from "./middleware/error-boundary.js"
import { logger } from "./middleware/logger.js"
import { publicResponseCache } from "./middleware/public-cache.js"
import {
  type RateLimitConfig,
  type RateLimitPolicy,
  rateLimit,
  resolveRateLimitStore,
} from "./middleware/rate-limit.js"
import { requireActor } from "./middleware/require-actor.js"
import { securityHeaders } from "./middleware/security-headers.js"
import { resolveSurfaceMountPath } from "./mount-paths.js"
import { noopReporter, safeCaptureException } from "./observability/reporter.js"
import { getRequestId } from "./observability/request-context.js"
import { assembleBodyKeyedCachePaths } from "./public-cache-paths.js"
import type { VoyantAppConfig, VoyantBindings, VoyantDb, VoyantVariables } from "./types.js"

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** The composed app's Hono env (bindings + framework request variables). */
type MountEnv<TBindings extends VoyantBindings> = {
  Bindings: TBindings
  Variables: VoyantVariables
}

// biome-ignore lint/suspicious/noExplicitAny: route helpers accept composed sub-apps with arbitrary Hono env generics -- owner: hono runtime.
type AnyHono = Hono<any, any, any>

function resolveConfiguredRateLimitStore<TBindings extends VoyantBindings>(
  config: RateLimitConfig | undefined,
  env: TBindings,
) {
  if (!config?.store) return undefined
  return typeof config.store === "function" ? config.store(env) : config.store
}

function buildRateLimitPolicy<TBindings extends VoyantBindings>(
  config: RateLimitConfig | undefined,
  env: TBindings,
  bucket: string,
  defaults: { max: number; windowSeconds: number },
): RateLimitPolicy {
  return {
    bucket,
    ...defaults,
    store: resolveConfiguredRateLimitStore(config, env) ?? resolveRateLimitStore({ env }),
  }
}

/**
 * A lazy route family recorded at mount time so a build-time OpenAPI generator
 * can eager-load it and merge its `.openapi()` operations (voyant#2114). Mirrors
 * `LazyMount` in `./openapi.ts` (kept structurally identical, but declared here
 * to avoid pulling the build-time-only openapi module into the runtime path).
 */
export interface LazyMount {
  /** Absolute surface mount prefix, or `"/"` for absolute `lazyRoutes`. */
  prefix: string
  load: LazyRoutesLoader
}

/**
 * A single module route mount recorded at mount time so a build-time generator
 * can produce one self-contained OpenAPI document per module (voyant#2733).
 * Mirrors `ModuleMount` in `./openapi.ts` (structurally identical, declared here
 * to keep the build-time-only openapi module out of the runtime path). `load`
 * returns the sub-app without serving it — eager mounts wrap the already-built
 * routes as `() => routes`; lazy mounts pass their loader.
 */
export interface ModuleMount {
  moduleName: string
  /** Absolute surface mount prefix, or `"/"` for absolute `lazyRoutes`. */
  prefix: string
  // biome-ignore lint/suspicious/noExplicitAny: accepts any composed sub-app regardless of its Env/Schema/BasePath, matching LazyRoutesLoader's AnyHono -- owner: hono runtime.
  load: () => Hono<any, any, any> | Promise<Hono<any, any, any>>
}

/**
 * App handle returned alongside the Hono instance. Carries `ready()` for
 * headless / sibling-process deployments that need to fire the lazy
 * bootstrap before the first HTTP request. Resident hosts and tests call this
 * so selected runtime registration completes without waiting for traffic.
 *
 * Returned via the augmented Hono instance: `app.ready` is attached
 * directly so the existing call sites (which destructure / pass `app`
 * around) keep working without a wrapper.
 */
export interface VoyantAppExtensions<TBindings = unknown> {
  /** Shared service registry populated by selected package bootstraps. */
  services: import("@voyant-travel/core").ModuleContainer
  /**
   * Resolves once the lazy bootstrap completes. Idempotent — multiple
   * calls share the same promise. Rejects after every selected bootstrap has
   * had a chance to run when any bootstrap failed. Use from tests + node sibling
   * processes where no request will arrive to trigger boot. See
   * architecture doc §18 + §18.1.
   *
   * Accepts the runtime bindings that the bootstrap should run with. For
   * binding-dependent configs (for example a managed-cloud forwarding
   * driver that reads credentials from `env`) callers MUST pass the real
   * bindings. Node and InMemory drivers usually ignore bindings, so the
   * no-arg form is safe there (defaults to `{}` for back-compat with tests).
   */
  ready(bindings?: TBindings): Promise<void>
  /**
   * The app's event bus (with every module/plugin subscriber attached).
   * Exposed for non-request contexts that must deliver events through
   * the same subscriber set — the outbox drain in a scheduled handler
   * being the canonical consumer:
   *
   *     await app.ready(env)
   *     await withNodeDatabase(env, (db) => drainOutbox(db, app.eventBus))
   */
  eventBus: import("@voyant-travel/core").EventBus
  /**
   * Lazy route families recorded at mount time (the wildcard dispatch stubs in
   * `lazy-routes.ts` don't reach the composed `OpenAPIHono` registry). A
   * build-time OpenAPI generator reads this to eager-load + merge their
   * `.openapi()` operations via `mergeLazyOpenApiPaths`. Never read at runtime.
   */
  lazyMounts: LazyMount[]
  /**
   * Every module route mount (admin + public, eager + lazy), tagged with its
   * owning module name (voyant#2733). A build-time generator reads this to
   * produce one self-contained OpenAPI document per module via
   * `generateModuleOpenApiDocuments`, keeping the module boundary authoritative
   * rather than guessed from path prefixes. Never read at runtime.
   */
  moduleMounts: ModuleMount[]
}

/**
 * Low-level app factory: given an already-resolved `modules`/`extensions` set
 * (plus middleware config), build the Hono app. Most deployments use the
 * config-driven `createApp` (see `create-app.ts`), which derives the modules
 * from a manifest + registry + capabilities and delegates here. Use `mountApp`
 * directly only when you have the resolved set in hand (tests, advanced hosts).
 */
export function mountApp<TBindings extends VoyantBindings>(
  config: VoyantAppConfig<TBindings>,
): Hono<MountEnv<TBindings>> & VoyantAppExtensions<TBindings> {
  // Composed root is an OpenAPIHono (a drop-in Hono superclass) so module routes
  // authored with `.openapi()` register here and the spec can be generated via
  // `@voyant-travel/hono/openapi` at build time. The doc *generator*
  // (`@asteasolutions/zod-to-openapi` + `openapi3-ts`) is only reachable through
  // `getOpenAPIDocument`, so it tree-shakes out of the Worker bundle; the
  // OpenAPIHono registry + validator glue (~35 KB) is the only runtime cost.
  const app: Hono<MountEnv<TBindings>> = new OpenAPIHono<MountEnv<TBindings>>()
  // Observability sink (RFC #1553) — resolved once and reused by both the
  // outer onError and the forwarded auth sub-app catch point below.
  const reporter = config.reporter ?? noopReporter
  const appName = config.appName ?? "voyant"
  app.onError((err, c) => handleApiError(err, c, { reporter, appName }))

  // Expose the same sink on the request context so a composed route module can
  // emit its own telemetry without the deployment threading a reporter through
  // every composition seam. Registered before everything else so it is present
  // even on requests that fail early.
  app.use("*", async (c, next) => {
    c.set("reporter", reporter)
    c.set("appName", appName)
    await next()
  })

  const basePath = normalizeBaseDispatchPath(config.basePath)
  if (basePath) {
    const dispatchWithoutBasePath = (request: Request): Request => {
      const url = new URL(request.url)
      url.pathname = url.pathname.slice(basePath.length) || "/"
      return new Request(url, request)
    }
    const forwardBasePath = (c: Context<MountEnv<TBindings>>) =>
      app.fetch(dispatchWithoutBasePath(c.req.raw), c.env, tryGetExecutionCtx(c) as never)
    app.all(basePath, forwardBasePath)
    app.all(`${basePath}/*`, forwardBasePath)
  }

  const pluginInputs = config.plugins ?? []
  const eagerPlugins: ApiBundle[] = []
  const lazyPlugins: LazyApiBundle[] = []
  const pluginNames = new Set<string>()
  for (const plugin of pluginInputs) {
    if (pluginNames.has(plugin.name)) {
      throw new Error(`Duplicate bundle name: "${plugin.name}"`)
    }
    pluginNames.add(plugin.name)
    if (isLazyApiBundle(plugin)) lazyPlugins.push(plugin)
    else eagerPlugins.push(plugin)
  }

  // Expand eager plugins into their constituent modules/extensions before
  // mounting. Lazy plugins keep only their static metadata in the eager closure.
  const expanded = eagerPlugins.length > 0 ? expandApiBundles(eagerPlugins) : null
  const allModules = [...(config.modules ?? []), ...(expanded?.modules ?? [])]
  const allExtensions = [...(config.extensions ?? []), ...(expanded?.extensions ?? [])]
  const linkDefinitions = [...(config.linkDefinitions ?? []), ...(expanded?.links ?? [])]
  if (config.link && linkDefinitions.length > 0) {
    throw new Error(
      "createApp: cannot configure both an explicit link service and link definitions",
    )
  }
  const createRequestLinkService =
    linkDefinitions.length > 0 ? createLinkServiceFactory(linkDefinitions) : undefined
  // Anonymous-access allow-list (ADR-0008): assembled from module/extension
  // `anonymous` declarations + bundle-declared absolute anonymous paths (e.g. a
  // payment-processor webhook) + any explicit `publicPaths` escape-hatch entries.
  // Used by both the auth middleware (skip auth / mark an explicit guest) and the
  // public-write rate-limit matcher below, so the two never diverge.
  const anonymousPaths = assembleAnonymousPaths(allModules, allExtensions, [
    ...(config.publicPaths ?? []),
    ...(expanded?.anonymousPaths ?? []),
    ...lazyPlugins.flatMap((plugin) => plugin.anonymous ?? []),
  ])
  const optionalCustomerAuthPaths = assembleOptionalCustomerAuthPaths(allModules, allExtensions)
  const clientAuthenticatedRoutes = assembleClientAuthenticatedRoutes(allModules)
  const bodyKeyedCachePaths = assembleBodyKeyedCachePaths(allModules, allExtensions)
  const composedAuth = composeAuthAugmentations(config.auth, allModules)
  // When the framework owns the bus, route subscriber-dispatch failures
  // (including the workflow forwarder) to the reporter — they're otherwise
  // only console-logged per the fire-and-forget EventBus contract (RFC #1553).
  // A deployment-supplied bus owns its own error routing.
  const eventBus =
    config.eventBus ??
    createEventBus({
      onSubscriberError: (event, error) =>
        safeCaptureException(reporter, {
          requestId: getRequestId() ?? "",
          app: appName,
          error,
          context: { event, surface: "event-bus" },
        }),
    })
  const query =
    typeof config.query === "function"
      ? config.query
      : config.query
        ? createQueryRunner(config.query)
        : undefined

  // Module container — registered services are resolvable from routes
  const container = createContainer()
  for (const mod of allModules) {
    if (mod.module.service !== undefined) {
      container.register(mod.module.name, mod.module.service)
    }
  }
  for (const sub of expanded?.subscribers ?? []) {
    eventBus.subscribe(sub.event, sub.handler, { inline: sub.inline ?? false })
  }

  const txModuleNames = new Set<string>()
  const txRequiringModules: string[] = []
  const txPrefixes: string[] = [...(config.dbTransactionalPaths ?? [])]

  function addTransactionalModuleName(name: string) {
    if (txModuleNames.has(name)) return
    txModuleNames.add(name)
    txRequiringModules.push(name)
    // `/v1/public/<name>` is added unconditionally (not only when the module
    // mounts publicRoutes): other modules mounted at the public root can serve
    // paths under a flagged module's segment.
    txPrefixes.push(`/v1/admin/${name}`, `/v1/${name}`, `/v1/public/${name}`)
  }

  function addTransactionalSurfaces(
    modules: readonly (typeof allModules)[number][],
    extensions: readonly (typeof allExtensions)[number][],
  ) {
    for (const mod of modules) {
      if (mod.module.requiresTransactionalDb) addTransactionalModuleName(mod.module.name)
    }
    for (const ext of extensions) {
      if (ext.extension.requiresTransactionalDb) addTransactionalModuleName(ext.extension.module)
    }
    for (const mod of modules) {
      if (txModuleNames.has(mod.module.name) && mod.publicRoutes) {
        txPrefixes.push(resolveSurfaceMountPath("/v1/public", mod.publicPath, mod.module.name))
      }
      if (mod.transactionalPaths) txPrefixes.push(...mod.transactionalPaths)
    }
    for (const ext of extensions) {
      if (txModuleNames.has(ext.extension.module) && ext.publicRoutes) {
        txPrefixes.push(resolveSurfaceMountPath("/v1/public", ext.publicPath, ext.extension.module))
      }
      if (ext.transactionalPaths) txPrefixes.push(...ext.transactionalPaths)
    }
  }

  addTransactionalSurfaces(allModules, allExtensions)
  for (const plugin of lazyPlugins) {
    for (const moduleName of plugin.transactionalModules ?? []) {
      addTransactionalModuleName(moduleName)
    }
    if (plugin.transactionalPaths) txPrefixes.push(...plugin.transactionalPaths)
  }

  const loadedLazyBundles = new Map<string, ApiBundle>()
  const lazyBundlePromises = new Map<string, Promise<ApiBundle>>()
  let lazyPluginExpansionPromise: Promise<void> | undefined
  const expandedLazyBundleNames = new Set<string>()

  function loadLazyBundle(plugin: LazyApiBundle): Promise<ApiBundle> {
    const cached = loadedLazyBundles.get(plugin.name)
    if (cached) return Promise.resolve(cached)
    const pending = lazyBundlePromises.get(plugin.name)
    if (pending) return pending

    const promise = plugin
      .load()
      .then((bundle) => {
        if (bundle.name !== plugin.name) {
          throw new Error(
            `Lazy bundle "${plugin.name}" loaded bundle "${bundle.name}". ` +
              "The metadata name must match the loaded bundle name.",
          )
        }
        loadedLazyBundles.set(plugin.name, bundle)
        return bundle
      })
      .catch((error) => {
        lazyBundlePromises.delete(plugin.name)
        throw error
      })
    lazyBundlePromises.set(plugin.name, promise)
    return promise
  }

  function applyLazyBundleContributions(bundles: readonly ApiBundle[]) {
    const pending = bundles.filter((bundle) => !expandedLazyBundleNames.has(bundle.name))
    if (pending.length === 0) return
    const lazyExpanded = expandApiBundles(pending)
    for (const bundle of pending) expandedLazyBundleNames.add(bundle.name)
    allModules.push(...lazyExpanded.modules)
    allExtensions.push(...lazyExpanded.extensions)
    anonymousPaths.push(
      ...assembleAnonymousPaths(lazyExpanded.modules, lazyExpanded.extensions, [
        ...lazyExpanded.anonymousPaths,
      ]),
    )
    optionalCustomerAuthPaths.push(
      ...assembleOptionalCustomerAuthPaths(lazyExpanded.modules, lazyExpanded.extensions),
    )
    for (const mod of lazyExpanded.modules) {
      if (mod.module.service !== undefined) {
        container.register(mod.module.name, mod.module.service)
      }
    }
    for (const sub of lazyExpanded.subscribers) {
      eventBus.subscribe(sub.event, sub.handler, { inline: sub.inline ?? false })
    }
    addTransactionalSurfaces(lazyExpanded.modules, lazyExpanded.extensions)
  }

  async function ensureBootstrapLazyPluginsExpanded() {
    const bootstrapLazyPlugins = lazyPlugins.filter((plugin) => plugin.loadOnBootstrap)
    if (bootstrapLazyPlugins.length === 0) return
    if (!lazyPluginExpansionPromise) {
      lazyPluginExpansionPromise = Promise.all(bootstrapLazyPlugins.map(loadLazyBundle))
        .then((bundles) => {
          applyLazyBundleContributions(bundles)
        })
        .catch((error) => {
          lazyPluginExpansionPromise = undefined
          throw error
        })
    }
    await lazyPluginExpansionPromise
  }

  let bootstrapPromise: Promise<void> | null = null
  let readinessPromise: Promise<void> | null = null
  const bootstrapFailures: Array<{ label: string; error: unknown }> = []
  function ensureRuntimeBootstrapped(bindings: TBindings) {
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        const ctx = { bindings, container, eventBus }
        await ensureBootstrapLazyPluginsExpanded()
        // Run each bootstrap in isolation — a single failing plugin/module/extension
        // must not poison the cached promise and kill the whole app's request pipeline.
        const runIsolated = async (label: string, fn?: (c: typeof ctx) => unknown) => {
          if (!fn) return
          try {
            await fn(ctx)
          } catch (error) {
            bootstrapFailures.push({ label, error })
            const message = error instanceof Error ? error.message : String(error)
            console.error(`[voyant] bootstrap failed for ${label}: ${message}`)
            // Bootstrap failures are startup-critical but silent today — surface
            // them to the reporter too (RFC #1553). No request context here.
            safeCaptureException(reporter, {
              requestId: getRequestId() ?? "",
              app: appName,
              error,
              context: { label, surface: "bootstrap" },
            })
          }
        }

        for (const plugin of [
          ...eagerPlugins,
          ...lazyPlugins
            .filter((p) => p.loadOnBootstrap)
            .map((p) => loadedLazyBundles.get(p.name)!),
        ]) {
          await runIsolated(`plugin:${plugin.name}`, plugin.bootstrap)
        }
        for (const mod of allModules) {
          await runIsolated(`module:${mod.module.name}`, mod.module.bootstrap)
        }
        for (const ext of allExtensions) {
          await runIsolated(
            `extension:${ext.extension.module}/${ext.extension.name}`,
            ext.extension.bootstrap,
          )
        }
      })()
    }

    return bootstrapPromise
  }

  function ensureRuntimeReady(bindings: TBindings): Promise<void> {
    if (!readinessPromise) {
      readinessPromise = ensureRuntimeBootstrapped(bindings).then(() => {
        if (bootstrapFailures.length === 0) return
        throw new AggregateError(
          bootstrapFailures.map(({ error }) => error),
          `Voyant app bootstrap failed for ${bootstrapFailures.map(({ label }) => label).join(", ")}`,
        )
      })
    }
    return readinessPromise
  }

  // Request ID header
  app.use("*", requestId)

  // Structured logger
  app.use("*", logger(config.logger))

  // CORS (allowlist via env CORS_ALLOWLIST). The customer realm additionally
  // supports per-storefront dynamic CORS when the auth integration provides a
  // `resolveCorsOrigin` authorizer: an operator-configured storefront authorizes
  // its own declared origins (exact + `https://*.host`) for direct cross-origin
  // SPA/native clients, while admin/dash surfaces keep the static allowlist.
  const resolveCorsOrigin = composedAuth?.resolveCorsOrigin
  app.use(
    "*",
    resolveCorsOrigin
      ? cors({
          resolveDynamicOrigin: (c) =>
            resolveCorsOrigin({
              request: c.req.raw,
              // The composed app's bindings ARE TBindings at runtime; the shared
              // cors() signature only knows the VoyantBindings base.
              env: c.env as TBindings,
              ctx: tryGetExecutionCtx(c),
            }),
          isDynamicPath: (pathname) => {
            const p = normalizePathname(pathname, { basePath: config.basePath })
            return (
              p === "/v1/public" ||
              p.startsWith("/v1/public/") ||
              p === "/auth/customer" ||
              p.startsWith("/auth/customer/")
            )
          },
        })
      : cors(),
  )

  if (config.securityHeaders !== false) {
    app.use("*", securityHeaders(config.securityHeaders))
  }

  if (config.requestBodyLimit !== false) {
    app.use(
      "*",
      requestBodyLimit({
        // Outer ceiling sized to the largest legitimate body (uploads); the
        // upload route enforces its own 25 MiB cap. See MAX_GLOBAL_REQUEST_BODY_BYTES.
        maxBytes: config.requestBodyLimit?.maxBytes ?? MAX_GLOBAL_REQUEST_BODY_BYTES,
        // JSON bodies keep the tighter 10 MiB cap (matching parseJsonBody) so
        // migrated `.openapi()` routes aren't loosened to the upload ceiling.
        jsonMaxBytes: config.requestBodyLimit?.jsonMaxBytes ?? DEFAULT_REQUEST_BODY_LIMIT_BYTES,
      }),
    )
  }

  if (config.rateLimit !== false) {
    const rateLimitConfig = config.rateLimit

    if (rateLimitConfig?.auth !== false) {
      const authRule = rateLimitConfig?.auth ?? { max: 10, windowSeconds: 60 }
      app.use("/auth/*", async (c, next) => {
        if (c.req.method !== "POST") return next()
        return rateLimit(buildRateLimitPolicy(rateLimitConfig, c.env, "auth", authRule))(c, next)
      })
    }

    if (rateLimitConfig?.publicWrite !== false) {
      const publicWriteRule = rateLimitConfig?.publicWrite ?? { max: 60, windowSeconds: 60 }
      app.use("*", async (c, next) => {
        if (!WRITE_METHODS.has(c.req.method)) return next()
        const pathname = normalizePathname(new URL(c.req.url).pathname, {
          basePath: config.basePath,
        })
        const isPublicWrite =
          pathname.startsWith("/v1/public/") ||
          matchesPublicPath(pathname, anonymousPaths) ||
          matchesClientAuthenticatedRoute(c.req.method, pathname, clientAuthenticatedRoutes)
        if (!isPublicWrite) return next()
        return rateLimit(
          buildRateLimitPolicy(rateLimitConfig, c.env, "public-write", publicWriteRule),
        )(c, next)
      })
    }
  }

  // Shared response cache for the public surface. Mounted BEFORE the
  // runtime bootstrap on purpose: a cache hit skips module-graph
  // instantiation, auth, and the per-request db client entirely — the
  // hit path allocates nothing but the cached body. Only responses a
  // route explicitly marks `Cache-Control: public, s-maxage=…` are
  // stored (see middleware docs).
  if (config.publicCache !== false) {
    app.use(
      "*",
      publicResponseCache({
        // Module-declared body-keyed reads, unless the deployment named its own.
        bodyKeyedPaths: bodyKeyedCachePaths,
        ...(config.publicCache ?? {}),
      }),
    )
  }

  // Per-request outbox store factory: emits happen in route handlers,
  // after the db middleware ran, so the request's db client is resolved
  // lazily at capture time. Outbox writes are single statements — the
  // cheap http client on non-transactional surfaces handles them fine.
  const buildOutboxStore = config.outbox
    ? (c: { env: TBindings; get(key: never): unknown }) =>
        createRequestOutboxStore({
          env: c.env,
          operationDbFactory: config.db,
          requestDb: () => c.get("db" as never) as VoyantDb | undefined,
        })
    : undefined

  app.use("*", async (c, next) => {
    c.set("container", container)
    // Request-scoped bus: emits defer non-`inline` subscribers past the
    // response via waitUntil, so handlers doing outbound HTTP (CMS sync,
    // e-invoicing) no longer add their latency to every mutation.
    //
    // With `outbox: true`, emits are also durable (persisted before
    // delivery, retried by `drainOutbox` from @voyant-travel/db/outbox) —
    // INCLUDING on runtimes without an ExecutionContext (Node/headless),
    // where emits await handlers inline but still capture through the
    // store. Only when there's neither a scheduler nor a store does the
    // raw bus go on the context unwrapped.
    const executionCtx = tryGetExecutionCtx(c)
    const outboxStore = buildOutboxStore?.(c)
    c.set(
      "eventBus",
      executionCtx || outboxStore
        ? requestScopedEventBus(
            eventBus,
            executionCtx ? (pending) => executionCtx.waitUntil(pending) : undefined,
            outboxStore,
          )
        : eventBus,
    )
    if (config.link) {
      c.set("link", config.link)
    }
    if (query) {
      c.set("query", query)
    }
    return next()
  })

  // Health check (public, no auth)
  app.get("/health", (c) => c.json({ status: "ok" }))

  // App-owned auth handler (must be before auth middleware — these routes are
  // public). Forwarding + observability bridging live in `mountAuthForwarding`.
  const authHandler = composedAuth?.handler
  if (authHandler) {
    mountAuthForwarding(app, authHandler, { reporter, appName })
  }

  // With a `dbTransactional` factory, requests are routed per surface:
  // transactional prefixes get it, everything else gets the cheap
  // default (typically neon-http — no per-request connection handshake).
  // Without it, `config.db` serves everything as before.
  const dbSource = config.dbTransactional
    ? createPathDbSelector({
        defaultFactory: config.db,
        transactionalFactory: config.dbTransactional,
        transactionalPrefixes: txPrefixes,
      })
    : config.db

  const authOptions = {
    publicPaths: anonymousPaths,
    optionalCustomerAuthPaths,
    clientAuthenticatedRoutes,
    basePath: config.basePath,
    auth: composedAuth,
  }

  // Auth middleware for all other routes
  app.use("*", requireAuth(dbSource, authOptions))

  // DB middleware — sets c.var.db for all downstream handlers.
  // Pass the list of modules that need interactive transactions so the
  // middleware can throw a clear startup-style error on first request if
  // the wired adapter is neon-http (which doesn't support db.transaction).
  app.use(
    "*",
    db(dbSource, { requiresTransactionalDb: txRequiringModules, basePath: config.basePath }),
  )

  app.use("*", async (c, next) => {
    // Bootstrap only after auth has admitted the request. Rejected requests
    // must not initialize package runtimes.
    await ensureRuntimeBootstrapped(c.env)
    return next()
  })

  if (createRequestLinkService) {
    app.use("*", async (c, next) => {
      c.set(
        "link",
        createRequestLinkService(() => c.get("db")),
      )
      return next()
    })
  }

  // Actor guards for the two API surfaces
  const actorOptions = {
    basePath: config.basePath,
    resources: config.accessResources,
    accessCatalog: config.accessCatalog,
    clientAuthenticatedRoutes,
  }
  app.use("/v1/admin/*", requireActor(actorOptions, "staff"))
  app.use("/v1/public/*", requireActor(actorOptions, "customer", "partner", "supplier"))

  // Admin capability discovery — GET /v1/admin/_meta/capabilities. A built-in
  // framework route (like /health), mounted only when the deployment supplies
  // the operation catalogue via `config.adminMeta` (from
  // `@voyant-travel/admin-contracts`) — keeping `@voyant-travel/hono` decoupled from it.
  // Guarded by the `/v1/admin/*` staff actor guard above.
  if (config.adminMeta) {
    const adminMeta = config.adminMeta
    app.get("/v1/admin/_meta/capabilities", (c) =>
      c.json({
        contractVersion: adminMeta.contractVersion,
        ...(adminMeta.deploymentVersion ? { deploymentVersion: adminMeta.deploymentVersion } : {}),
        modules: allModules.map((m) => m.module.name),
        operations: adminMeta.operations,
        actor: c.get("actor"),
        scopes: c.get("scopes"),
      }),
    )
  }

  // Lazy route families recorded for build-time OpenAPI merging. The wildcard
  // dispatch stubs registered by `mountLazyRoutesAt`/`mountLazyRoutePaths` never
  // reach the composed OpenAPIHono registry, so the spec generator replays these
  // loaders (see `mergeLazyOpenApiPaths`). Recorded in the same loop that mounts
  // them so the prefix logic is single-sourced here. Cheap array pushes — no
  // eager `import()` and no runtime read.
  const lazyMounts: LazyMount[] = []
  // Per-module OpenAPI generation manifest (voyant#2733). Recorded alongside the
  // mount so the module name + real prefix are single-sourced here; `publicPath`
  // overrides are captured with their actual mount, not re-derived. Eager routes
  // are wrapped as `() => routes` so the generator's loader-based path is
  // uniform across eager + lazy. Webhook routes are intentionally excluded — the
  // per-module docs cover the admin/storefront surfaces only.
  const moduleMounts: ModuleMount[] = []
  const deferredLazyRouteMounts: Array<() => void> = []

  function deferLazyRoutesAt(moduleName: string, prefix: string, load: LazyRoutesLoader) {
    lazyMounts.push({ prefix, load })
    moduleMounts.push({ moduleName, prefix, load })
    deferredLazyRouteMounts.push(() => {
      mountLazyRoutesAt(app, prefix, load)
    })
  }

  function deferLazyRoutePaths(
    moduleName: string,
    paths: readonly string[],
    load: LazyRoutesLoader,
  ) {
    lazyMounts.push({ prefix: "/", load })
    moduleMounts.push({ moduleName, prefix: "/", load })
    deferredLazyRouteMounts.push(() => {
      mountLazyRoutePaths(app, paths, load)
    })
  }

  function mountModuleRoutesInto(target: AnyHono, mod: (typeof allModules)[number]) {
    const moduleName = mod.module.name
    const adminPrefix = `/v1/admin/${moduleName}`
    const publicPrefix = resolveSurfaceMountPath("/v1/public", mod.publicPath, moduleName)
    if (mod.adminRoutes) {
      target.route(adminPrefix, mod.adminRoutes)
    }
    if (mod.publicRoutes) {
      target.route(publicPrefix, mod.publicRoutes)
    }
    if (mod.lazyAdminRoutes) {
      mountLazyRoutesAt(target, adminPrefix, mod.lazyAdminRoutes)
    }
    if (mod.lazyPublicRoutes) {
      mountLazyRoutesAt(target, publicPrefix, mod.lazyPublicRoutes)
    }
    if (mod.lazyRoutes) {
      mountLazyRoutePaths(target, mod.lazyRoutes.paths, mod.lazyRoutes.load)
    }
    if (mod.webhookRoutes) {
      target.route(`/v1/${moduleName}`, mod.webhookRoutes)
    }
  }

  function mountExtensionRoutesInto(target: AnyHono, ext: (typeof allExtensions)[number]) {
    const moduleName = ext.extension.module
    const adminPrefix = `/v1/admin/${moduleName}`
    const publicPrefix = resolveSurfaceMountPath("/v1/public", ext.publicPath, moduleName)
    if (ext.adminRoutes) {
      target.route(adminPrefix, ext.adminRoutes)
    }
    if (ext.publicRoutes) {
      target.route(publicPrefix, ext.publicRoutes)
    }
    if (ext.lazyAdminRoutes) {
      mountLazyRoutesAt(target, adminPrefix, ext.lazyAdminRoutes)
    }
    if (ext.lazyPublicRoutes) {
      mountLazyRoutesAt(target, publicPrefix, ext.lazyPublicRoutes)
    }
    if (ext.lazyRoutes) {
      mountLazyRoutePaths(target, ext.lazyRoutes.paths, ext.lazyRoutes.load)
    }
    if (ext.webhookRoutes) {
      target.route(`/v1/${moduleName}`, ext.webhookRoutes)
    }
  }

  function buildBundleRouteApp(bundle: ApiBundle): AnyHono {
    const pluginRoutes = new OpenAPIHono()
    const bundleExpanded: ExpandedApiBundles = expandApiBundles([bundle])
    for (const mod of bundleExpanded.modules) mountModuleRoutesInto(pluginRoutes, mod)
    for (const ext of bundleExpanded.extensions) mountExtensionRoutesInto(pluginRoutes, ext)
    return pluginRoutes
  }

  // Mount module routes
  for (const mod of allModules) {
    const moduleName = mod.module.name
    const adminPrefix = `/v1/admin/${moduleName}`
    const publicPrefix = resolveSurfaceMountPath("/v1/public", mod.publicPath, moduleName)
    if (mod.adminRoutes) {
      const adminRoutes = mod.adminRoutes
      app.route(adminPrefix, adminRoutes)
      moduleMounts.push({ moduleName, prefix: adminPrefix, load: () => adminRoutes })
    }
    if (mod.publicRoutes) {
      const publicRoutes = mod.publicRoutes
      app.route(publicPrefix, publicRoutes)
      moduleMounts.push({ moduleName, prefix: publicPrefix, load: () => publicRoutes })
    }
    if (mod.lazyAdminRoutes) {
      deferLazyRoutesAt(moduleName, adminPrefix, mod.lazyAdminRoutes)
    }
    if (mod.lazyPublicRoutes) {
      deferLazyRoutesAt(moduleName, publicPrefix, mod.lazyPublicRoutes)
    }
    if (mod.lazyRoutes) {
      deferLazyRoutePaths(moduleName, mod.lazyRoutes.paths, mod.lazyRoutes.load)
    }
    if (mod.webhookRoutes) {
      app.route(`/v1/${moduleName}`, mod.webhookRoutes)
    }
  }

  // Mount extension routes
  for (const ext of allExtensions) {
    const moduleName = ext.extension.module
    const adminPrefix = `/v1/admin/${moduleName}`
    const publicPrefix = resolveSurfaceMountPath("/v1/public", ext.publicPath, moduleName)
    if (ext.adminRoutes) {
      const adminRoutes = ext.adminRoutes
      app.route(adminPrefix, adminRoutes)
      moduleMounts.push({ moduleName, prefix: adminPrefix, load: () => adminRoutes })
    }
    if (ext.publicRoutes) {
      const publicRoutes = ext.publicRoutes
      app.route(publicPrefix, publicRoutes)
      moduleMounts.push({ moduleName, prefix: publicPrefix, load: () => publicRoutes })
    }
    if (ext.lazyAdminRoutes) {
      deferLazyRoutesAt(moduleName, adminPrefix, ext.lazyAdminRoutes)
    }
    if (ext.lazyPublicRoutes) {
      deferLazyRoutesAt(moduleName, publicPrefix, ext.lazyPublicRoutes)
    }
    if (ext.lazyRoutes) {
      deferLazyRoutePaths(moduleName, ext.lazyRoutes.paths, ext.lazyRoutes.load)
    }
    if (ext.webhookRoutes) {
      app.route(`/v1/${moduleName}`, ext.webhookRoutes)
    }
  }

  for (const plugin of lazyPlugins) {
    if (!plugin.routes || plugin.routes.length === 0) continue
    deferLazyRoutePaths(`plugin:${plugin.name}`, plugin.routes, async () => {
      const bundle = await loadLazyBundle(plugin)
      applyLazyBundleContributions([bundle])
      return buildBundleRouteApp(bundle)
    })
  }

  for (const mountLazyRoutes of deferredLazyRouteMounts) {
    mountLazyRoutes()
  }

  // Additional routes
  if (config.additionalRoutes) {
    config.additionalRoutes(app)
  }

  // Attach `ready()` directly to the Hono instance. Fires the lazy
  // bootstrap with the supplied bindings (or `{}` for back-compat with
  // node / InMemory drivers that ignore them). The Node host calls `ready()`
  // before exposing a loaded runtime; request-driven/Worker hosts retain the
  // same lazy boot via `ensureRuntimeBootstrapped(c.env)`. Tests + node sibling
  // processes also use this so the time wheel + manifest registration happen
  // without traffic. Binding-dependent drivers must pass the real `env`.
  const augmented = app as Hono<MountEnv<TBindings>> & VoyantAppExtensions<TBindings>
  augmented.services = container
  augmented.eventBus = eventBus
  augmented.lazyMounts = lazyMounts
  augmented.moduleMounts = moduleMounts
  augmented.ready = (bindings?: TBindings) => ensureRuntimeReady(bindings ?? ({} as TBindings))
  return augmented
}

function normalizeBaseDispatchPath(basePath: string | undefined): string | null {
  const trimmed = basePath?.trim()
  if (!trimmed || trimmed === "/") return null
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  return normalized.replace(/\/+$/, "") || null
}
