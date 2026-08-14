import type { BootstrapHandler, LinkDefinition, Subscriber } from "@voyant-travel/core"

import type { ApiExtension, ApiModule } from "./module.js"

/**
 * Reusable server API contribution surface.
 *
 * `@voyant-travel/hono` is Voyant's sole server API runtime implementation.
 * `ApiBundle` describes packages that contribute {@link ApiModule} /
 * {@link ApiExtension} wrappers carrying HTTP routes.
 *
 * Registered via `createApp({ plugins: [...] })` — the app factory expands
 * each bundle into the underlying modules, extensions, subscribers, and link
 * definitions before mounting them.
 */
export interface ApiBundle {
  /** Unique bundle identifier (e.g. "netopia", "bokun"). */
  name: string
  /** Optional version tag for diagnostics. */
  version?: string
  /** Optional lazy runtime bootstrap executed once per app/isolate. */
  bootstrap?: BootstrapHandler
  /** API modules (module + routes) contributed by the plugin. */
  modules?: ApiModule[]
  /** API extensions (extension + routes) contributed by the plugin. */
  extensions?: ApiExtension[]
  /** Event subscribers wired to the caller's event bus, when provided. */
  subscribers?: Subscriber[]
  /** Link definitions contributed by the plugin. */
  links?: LinkDefinition[]
  /**
   * Absolute API paths this bundle exposes that are reachable WITHOUT a session
   * (ADR-0008). Unlike a module/extension's `anonymous` (relative to its
   * `/v1/public` mount), bundle routes can mount anywhere — e.g. a payment
   * processor's webhook at `/v1/finance/providers/netopia/callback`, which the
   * processor's servers POST to without a cookie or bearer. Declaring it here
   * keeps the "reachable-without-auth" decision with the plugin that owns the
   * route, instead of in every deployment's `publicPaths`. The framework folds
   * these into the assembled anonymous allow-list.
   */
  anonymous?: string[]
  /**
   * Absolute `/v1/public/*` paths this bundle exposes that a PUBLISHABLE
   * (`vpk_`) storefront key may call (voyant#4625). Same absolute-path shape as
   * `anonymous`, and for the same reason: a bundle's routes can mount anywhere.
   *
   * Declaring nothing denies the bundle's public routes to publishable keys —
   * the capability line is an allow-list, so silence is a denial.
   */
  publishable?: string[]
  /**
   * Absolute `/v1/public/*` paths this bundle exposes that capture unchallenged
   * person data (voyant#4625). Publishable-key callable only on a deployment
   * with an intake guard configured.
   */
  guardedIntake?: string[]
}

const LAZY_API_BUNDLE = Symbol.for("voyant.api.lazyBundle")

/**
 * Lazy bundle declaration. The bundle's heavy runtime graph is imported only
 * when a declared route matcher is hit, unless `loadOnBootstrap` asks the app
 * to load it during request/headless bootstrap. `name` and `anonymous` remain
 * eager metadata so duplicate checks and auth allow-lists stay fail-closed.
 */
export interface LazyApiBundle {
  readonly [LAZY_API_BUNDLE]: true
  /** Unique bundle identifier matching the loaded bundle's `name`. */
  name: string
  /** Optional version tag for diagnostics. */
  version?: string
  /**
   * Absolute unauthenticated paths contributed by the eventual bundle. Declare
   * webhook/callback paths here so the first matching request can pass auth
   * before the bundle has been imported.
   */
  anonymous?: string[]
  /**
   * Absolute publishable-key paths contributed by the eventual bundle, eager
   * for the same reason `anonymous` is: the capability line must be able to
   * answer for the first matching request, before the bundle is imported. Not
   * declaring them keeps the bundle secret-key-only, which is the fail-closed
   * direction.
   */
  publishable?: string[]
  /** Absolute unchallenged-intake paths contributed by the eventual bundle. */
  guardedIntake?: string[]
  /**
   * Absolute route matchers the eventual bundle may serve. Required for lazy
   * bundles that contribute HTTP routes because Hono routes must be registered
   * before the first request builds the matcher.
   */
  routes?: readonly string[]
  /**
   * Module names whose lazy-loaded routes must receive a transaction-capable DB
   * client. This is eager metadata so the first matching request is routed to
   * `dbTransactional` before the bundle implementation is imported.
   */
  transactionalModules?: readonly string[]
  /**
   * Absolute API path prefixes whose lazy-loaded routes must receive the
   * transaction-capable DB client. Use this when only a subset of the lazy
   * bundle's explicit `routes` require transactions.
   */
  transactionalPaths?: readonly string[]
  /**
   * Load this bundle during app bootstrap instead of waiting for a declared
   * route matcher. Set this for lazy bundles that contribute subscribers,
   * container services, or bootstraps needed before a bundle-owned route is hit.
   */
  loadOnBootstrap?: boolean
  /** Loads and constructs the real bundle. Memoized by `mountApp`. */
  load: () => Promise<ApiBundle>
}

export type ApiBundleInput = ApiBundle | LazyApiBundle

/**
 * Identity helper — returns the bundle unchanged, purely for IDE inference.
 */
export function defineApiBundle<P extends ApiBundle>(bundle: P): P {
  return bundle
}

export function defineLazyApiBundle<P extends Omit<LazyApiBundle, typeof LAZY_API_BUNDLE>>(
  bundle: P,
): P & LazyApiBundle {
  return { ...bundle, [LAZY_API_BUNDLE]: true } as P & LazyApiBundle
}

export function isLazyApiBundle(bundle: ApiBundleInput): bundle is LazyApiBundle {
  return (bundle as LazyApiBundle)[LAZY_API_BUNDLE] === true
}

export interface ExpandedApiBundles {
  modules: ApiModule[]
  extensions: ApiExtension[]
  subscribers: Subscriber[]
  links: LinkDefinition[]
  /** Absolute anonymous-access paths declared by bundles (ADR-0008). */
  anonymousPaths: string[]
  /** Absolute publishable-key paths declared by bundles (voyant#4625). */
  publishablePaths: string[]
  /** Absolute unchallenged-intake paths declared by bundles (voyant#4625). */
  guardedIntakePaths: string[]
}

/**
 * Flatten a list of {@link ApiBundle} values into their constituent pieces.
 *
 * Throws if two bundles declare the same `name`.
 */
export function expandApiBundles(bundles: ReadonlyArray<ApiBundle>): ExpandedApiBundles {
  const seen = new Set<string>()
  const modules: ApiModule[] = []
  const extensions: ApiExtension[] = []
  const subscribers: Subscriber[] = []
  const links: LinkDefinition[] = []
  const anonymousPaths: string[] = []
  const publishablePaths: string[] = []
  const guardedIntakePaths: string[] = []

  for (const bundle of bundles) {
    if (seen.has(bundle.name)) {
      throw new Error(`Duplicate bundle name: "${bundle.name}"`)
    }
    seen.add(bundle.name)

    if (bundle.modules) modules.push(...bundle.modules)
    if (bundle.extensions) extensions.push(...bundle.extensions)
    if (bundle.subscribers) subscribers.push(...bundle.subscribers)
    if (bundle.links) links.push(...bundle.links)
    if (bundle.anonymous) anonymousPaths.push(...bundle.anonymous)
    if (bundle.publishable) publishablePaths.push(...bundle.publishable)
    if (bundle.guardedIntake) guardedIntakePaths.push(...bundle.guardedIntake)
  }

  return {
    modules,
    extensions,
    subscribers,
    links,
    anonymousPaths,
    publishablePaths,
    guardedIntakePaths,
  }
}
