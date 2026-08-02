import {
  type AnyRoute,
  createRoute,
  lazyRouteComponent,
  redirect,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import * as React from "react"
import {
  type AdminExtension,
  type AdminRoutePageProps,
  type AdminRouteRuntime,
  type AdminUiRouteContribution,
  findAdminRouteContribution,
  type ImplementedAdminRoute,
  requireImplementedAdminRoute,
} from "../extensions.js"
import type { AdminDestinationResolvers } from "../navigation/destinations.js"
import { useLocale } from "../providers/locale.js"

import type { AdminRouterContext } from "./router.js"

/**
 * Code-assembled extension routes (packaged-admin RFC §4.8 endgame).
 *
 * Package-delivered admin pages exist as NO per-route files in the host:
 * the host's generated admin route module turns each extension route
 * contribution into a code-based `createRoute(...)` grafted under the
 * workspace layout via {@link attachAdminExtensionRoutes}. This module is
 * the binding layer between the transport-agnostic contribution contract
 * (`@voyant-travel/admin`) and TanStack Router:
 *
 * - {@link adminExtensionRouteOptions} resolves a contribution by id and
 *   returns the router-facing route options — component (lazy, with intent
 *   preload), loader (QueryClient + app runtime + params), per-route `ssr`
 *   mode, and boundaries — ready to spread into `createRoute({...})`.
 * - {@link attachAdminExtensionRoutes} grafts the built routes under the
 *   host's file-based workspace layout, idempotently (replace-by-path), so
 *   dev-server module re-evaluation never duplicates routes.
 */

/** App runtime for extension route loaders — a value or a per-call thunk. */
export type AdminExtensionRouteRuntime = AdminRouteRuntime | (() => AdminRouteRuntime)

function resolveRuntime(runtime: AdminExtensionRouteRuntime): AdminRouteRuntime {
  return typeof runtime === "function" ? runtime() : runtime
}

/**
 * Loader args the bound extension loader reads. Deliberately a subset of
 * TanStack's loader context — the binder only forwards what the
 * contribution contract knows about (QueryClient via router context, path
 * params), which keeps contributions router-agnostic.
 */
export interface AdminExtensionRouteLoaderArgs {
  context: AdminRouterContext
  params: Record<string, string>
}

type PreloadableComponent = React.FunctionComponent & {
  preload?: () => Promise<void>
}

export interface AdminExtensionRouteOptions {
  /** Absent for `redirectTo` contributions — the redirect never renders. */
  component?: PreloadableComponent
  loader: (args: AdminExtensionRouteLoaderArgs) => unknown
  /**
   * Set for `redirectTo` contributions: throws the router redirect before
   * the route matches, which also covers SSR (the server responds with the
   * redirect instead of rendering an empty page).
   */
  beforeLoad?: () => void
  ssr?: boolean | "data-only"
  /**
   * Set for lazy `page` contributions: the binder component suspends while
   * the page chunk loads, and the route's pending boundary is what should
   * catch that — not an ancestor boundary.
   */
  wrapInSuspense?: boolean
  pendingComponent?: React.FunctionComponent
  errorComponent?: React.FunctionComponent<{ error: Error; reset: () => void }>
}

interface LazyPageModule {
  default: React.ComponentType<AdminRoutePageProps>
}

/**
 * Wrap a lazy `page` contribution into a route component that injects route
 * state ({@link AdminRoutePageProps}) read from the matched route. The page
 * chunk stays code-split (the router's lazy-component machinery), and the
 * wrapper forwards `preload` so hover/intent preloading fetches the chunk
 * ahead of navigation.
 */
function createAdminRoutePageComponent(route: ImplementedAdminRoute): PreloadableComponent {
  const page = route.page
  if (!page) {
    throw new Error(
      `[voyant-admin] Route contribution "${route.id}" has no \`page\` loader to bind.`,
    )
  }
  const LazyPage = lazyRouteComponent<LazyPageModule>(page)

  function AdminExtensionRoutePage() {
    const params = useParams({ strict: false }) as Record<string, string>
    const search = useSearch({ strict: false }) as Record<string, unknown>
    const navigate = useNavigate()
    const updateSearch = React.useCallback<AdminRoutePageProps["updateSearch"]>(
      (updater, options) => {
        void navigate({
          // Same-route navigation: patch search state in place.
          to: ".",
          search: (prev: Record<string, unknown>) => updater(prev),
          replace: options?.replace ?? true,
        })
      },
      [navigate],
    )

    return React.createElement(LazyPage, {
      params,
      search,
      updateSearch,
      title: route.title,
    })
  }
  AdminExtensionRoutePage.displayName = `AdminExtensionRoutePage(${route.id})`
  AdminExtensionRoutePage.preload = (LazyPage as PreloadableComponent).preload
  return AdminExtensionRoutePage
}

function withRouteMessagesProvider(
  route: ImplementedAdminRoute,
  Component: PreloadableComponent | undefined,
): PreloadableComponent | undefined {
  const loadProvider = route.routeMessagesProvider
  if (!loadProvider || !Component) return Component

  const WrappedComponent = Component
  const LazyProvider = React.lazy(loadProvider)

  function AdminExtensionRouteMessagesProvider() {
    const { resolvedLocale, timeZone } = useLocale()
    return (
      <LazyProvider locale={resolvedLocale} timeZone={timeZone}>
        <WrappedComponent />
      </LazyProvider>
    )
  }

  AdminExtensionRouteMessagesProvider.displayName = `AdminExtensionRouteMessagesProvider(${route.id})`
  AdminExtensionRouteMessagesProvider.preload = async () => {
    await Promise.all([WrappedComponent.preload?.(), loadProvider().then(() => undefined)])
  }
  return AdminExtensionRouteMessagesProvider
}

/**
 * Resolve an extension route contribution by id and return the route
 * options the host's generated admin route module spreads into a
 * code-based `createRoute({...})`.
 *
 * Path and typed search contract stay literal in the generated module (they
 * are what gives the host typed links); everything else — page, loader,
 * SSR mode, boundaries — comes from the contribution.
 */
export function adminExtensionRouteOptions(
  extension: AdminExtension,
  routeId: string,
  runtime: AdminExtensionRouteRuntime,
): AdminExtensionRouteOptions {
  const route = requireImplementedAdminRoute(extension, routeId)
  return adminRouteOptionsFromContribution(route, runtime)
}

function adminRouteOptionsFromContribution(
  route: ImplementedAdminRoute,
  runtime: AdminExtensionRouteRuntime,
): AdminExtensionRouteOptions {
  const redirectTo = route.redirectTo
  const baseComponent = route.page
    ? createAdminRoutePageComponent(route)
    : (route.component as PreloadableComponent | undefined)
  const component = withRouteMessagesProvider(route, baseComponent)

  return {
    component,
    beforeLoad: redirectTo
      ? () => {
          throw redirect({ to: redirectTo, replace: true })
        }
      : undefined,
    loader: ({ context, params }: AdminExtensionRouteLoaderArgs) =>
      route.loader?.({
        queryClient: context.queryClient,
        runtime: resolveRuntime(runtime),
        params,
      }),
    ssr: route.ssr,
    wrapInSuspense: route.page || route.routeMessagesProvider ? true : undefined,
    pendingComponent: route.pendingComponent as React.FunctionComponent | undefined,
    errorComponent: route.errorComponent as
      | React.FunctionComponent<{ error: Error; reset: () => void }>
      | undefined,
  }
}

export interface AdminExtensionChildRoutesOptions {
  /**
   * Child contribution paths the host's generated module already binds
   * statically (with literal paths + typed-link map entries). Children on
   * this list are skipped; everything else — e.g. app-supplied extra
   * settings pages the generator cannot scan — is built here at runtime.
   */
  exclude?: ReadonlyArray<string>
}

/**
 * Build code-based child routes for a layout contribution's
 * `children` that are NOT statically emitted by the host's generated
 * module (packaged-admin RFC §4.8 + core-extension nesting).
 *
 * Static children keep literal paths in the generated module for typed
 * links; dynamic children (app-supplied at factory time) bind here and are
 * reachable via plain string navigation only.
 */
export function adminExtensionChildRoutes(
  extension: AdminExtension,
  parentRouteId: string,
  getParentRoute: () => AnyRoute,
  runtime: AdminExtensionRouteRuntime,
  options: AdminExtensionChildRoutesOptions = {},
): Array<AnyRoute> {
  const parent = findAdminRouteContribution(extension.routes, parentRouteId)
  if (!parent) {
    throw new Error(
      `[voyant-admin] Extension "${extension.id}" has no route contribution "${parentRouteId}".`,
    )
  }
  const exclude = new Set(options.exclude ?? [])

  return uniqueContributionsByPath(
    (parent.children ?? []).filter((child) => !exclude.has(child.path)),
  ).map((child) => {
    const options = {
      getParentRoute,
      path: child.path,
      validateSearch: child.validateSearch,
      ...adminRouteOptionsFromContribution(requireChildImplementation(extension, child), runtime),
    }
    // Runtime-built routes carry no typed-link contract (they are invisible
    // to the host's generated typed-link maps), so the loose cast is sound.
    return createRoute(options)
  })
}

function requireChildImplementation(
  extension: AdminExtension,
  child: AdminUiRouteContribution,
): ImplementedAdminRoute {
  if (!child.page && !child.component && !child.redirectTo) {
    throw new Error(
      `[voyant-admin] Child route contribution "${child.id}" of extension ` +
        `"${extension.id}" carries no implementation (neither \`page\`, \`component\`, ` +
        `nor \`redirectTo\`).`,
    )
  }
  return child as ImplementedAdminRoute
}

/**
 * Build code-based TOP-LEVEL routes for a set of admin extensions' route
 * contributions, at runtime — for DISCOVERED (`src/admin/*`) deployment-local
 * extensions the host's `voyant admin generate` never scanned. Mirrors the
 * generated `admin.routes.generated.tsx` `createRoute` loop, then hand the
 * result to {@link attachAdminExtensionRoutes} alongside the generated routes.
 *
 * Runtime-built routes carry NO typed-link contract (they are invisible to the
 * host's generated typed-link maps), so they are reachable via plain string
 * navigation only — the same trade-off as {@link adminExtensionChildRoutes}.
 * Nested `children` are not built here (top-level pages only); a contribution
 * needs a `page`, `component`, or `redirectTo` to count as implemented.
 */
export function buildAdminExtensionRoutes(
  extensions: ReadonlyArray<AdminExtension>,
  getParentRoute: () => AnyRoute,
  runtime: AdminExtensionRouteRuntime,
): Array<AnyRoute> {
  const routes: Array<AnyRoute> = []
  for (const extension of extensions) {
    for (const contribution of extension.routes ?? []) {
      const route = createRoute({
        getParentRoute,
        path: contribution.path,
        validateSearch: contribution.validateSearch,
        ...adminExtensionRouteOptions(extension, contribution.id, runtime),
      })
      // Layout contributions (e.g. core `/settings`) nest child pages under
      // `children`; build and attach them too, else deep links like
      // `/settings/api-tokens` land on not-found. A generated host binds these
      // statically for typed links — a runtime host builds them all here.
      if (contribution.children && contribution.children.length > 0) {
        route.addChildren(
          adminExtensionChildRoutes(extension, contribution.id, () => route, runtime),
        )
      }
      routes.push(route)
    }
  }
  return uniqueRoutesByPath(routes)
}

/**
 * Build the semantic-destination resolver map from an extension registry at
 * runtime — the runtime analogue of `voyant admin generate --destinations`.
 *
 * Scans every route contribution (and layout children) for a `destination`
 * binding whose `path` resolves by pure param interpolation, and emits a
 * resolver per key (`encodeURIComponent`, with `destinationParams` mapping
 * route-param names to destination-param names). Pass the result to the
 * workspace shell's `destinations` prop so packaged pages' `useAdminHref` /
 * `useAdminNavigate` resolve instead of falling back to `#`.
 *
 * Partial by construction: destinations whose resolver needs more than path
 * interpolation (search-param construction, multi-route targets) are the
 * host's to add; the navigation provider falls back to `#` for any unbound key.
 */
export function buildAdminExtensionDestinations(
  extensions: ReadonlyArray<AdminExtension>,
): Partial<AdminDestinationResolvers> {
  const resolvers: Record<string, (params: Record<string, unknown>) => string> = {}

  const collect = (contribution: AdminUiRouteContribution): void => {
    if (contribution.destination && !(contribution.destination in resolvers)) {
      resolvers[contribution.destination] = destinationResolver(
        contribution.path,
        contribution.destinationParams ?? {},
        contribution.destinationSearchParams ?? [],
      )
    }
    for (const child of contribution.children ?? []) collect(child)
  }

  for (const extension of extensions) {
    for (const contribution of extension.routes ?? []) collect(contribution)
  }
  return resolvers as Partial<AdminDestinationResolvers>
}

/** A `$param`-interpolating href resolver for a route path + param-name map. */
function destinationResolver(
  path: string,
  destinationParams: Record<string, string>,
  destinationSearchParams: readonly string[],
): (params: Record<string, unknown>) => string {
  return (params) => {
    const resolvedPath = path.replace(/\$([A-Za-z0-9_]+)/g, (_match, routeParam: string) => {
      const destParam = destinationParams[routeParam] ?? routeParam
      return encodeURIComponent(String(params[destParam]))
    })
    const search = new URLSearchParams()
    for (const param of destinationSearchParams) {
      const value = params[param]
      if (value === undefined || value === null || value === "") continue
      search.set(param, String(value))
    }
    const query = search.toString()
    return query ? `${resolvedPath}?${query}` : resolvedPath
  }
}

/**
 * Graft code-built extension routes under a file-based parent route
 * (typically the workspace layout) and return the tree for `_addFileTypes`
 * re-typing. Idempotent: an extension route replaces any previously grafted
 * route with the same path, so dev-server re-evaluation of the generated
 * module never duplicates children.
 */
export function attachAdminExtensionRoutes<TRouteTree extends AnyRoute>(
  routeTree: TRouteTree,
  parentRoute: AnyRoute,
  extensionRoutes: ReadonlyArray<AnyRoute>,
): TRouteTree {
  const uniqueExtensionRoutes = uniqueRoutesByPath(extensionRoutes)
  const existing: Array<AnyRoute> = Array.isArray(parentRoute.children)
    ? (parentRoute.children as Array<AnyRoute>)
    : []
  const extensionPaths = new Set(
    uniqueExtensionRoutes.map((route) => (route.options as { path?: string }).path),
  )
  const children = [
    ...existing.filter((route) => !extensionPaths.has((route.options as { path?: string }).path)),
    ...uniqueExtensionRoutes,
  ]
  parentRoute.addChildren(children)
  return routeTree
}

function uniqueContributionsByPath(
  contributions: ReadonlyArray<AdminUiRouteContribution>,
): ReadonlyArray<AdminUiRouteContribution> {
  const unique = new Map<string, AdminUiRouteContribution>()
  for (const contribution of contributions) unique.set(contribution.path, contribution)
  return [...unique.values()]
}

function uniqueRoutesByPath(routes: ReadonlyArray<AnyRoute>): Array<AnyRoute> {
  const unique = new Map<string, AnyRoute>()
  const unkeyed: AnyRoute[] = []
  for (const route of routes) {
    const path = (route.options as { path?: string }).path
    if (typeof path === "string") unique.set(path, route)
    else unkeyed.push(route)
  }
  return [...unkeyed, ...unique.values()]
}
