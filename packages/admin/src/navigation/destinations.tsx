import * as React from "react"

/**
 * Semantic admin navigation destinations (packaged-admin RFC §4.7).
 *
 * Package-owned admin pages cannot import a host's typed route tree, so they
 * never navigate by route path. Instead they navigate to a semantic
 * destination KEY; the host registers a key → href resolver map once.
 *
 * This interface ships empty. Domain packages declare the destinations their
 * pages need via TypeScript declaration merging (the same `Register` trick
 * TanStack Router uses):
 *
 * ```ts
 * // inside @voyant-travel/catalog-react
 * declare module "@voyant-travel/admin" {
 *   interface AdminDestinations {
 *     "supplier.detail": { supplierId: string }
 *   }
 * }
 * ```
 *
 * Naming convention: `<entity>.<action>` (e.g. `"product.detail"`,
 * `"catalog.detail"`). The host then provides a resolver per declared
 * key — `satisfies AdminDestinationResolvers` makes the map exhaustive.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by domain packages via declaration merging -- owner: admin; existing suppression is intentional pending typed cleanup.
export interface AdminDestinations {}

/** Union of all declared destination keys (empty until packages augment). */
export type AdminDestinationKey = keyof AdminDestinations & string

/**
 * The host's resolver map: one `params → href` function per declared
 * destination key. Mapped over {@link AdminDestinations}, so `satisfies
 * AdminDestinationResolvers` fails to compile when a declared key is missing
 * a resolver — exhaustiveness is the host's proof of contract.
 */
export type AdminDestinationResolvers = {
  [K in AdminDestinationKey]: (params: AdminDestinations[K]) => string
}

/** Resolve a destination key + params to an href. Returned by {@link useAdminHref}. */
export type AdminHrefResolver = <K extends AdminDestinationKey>(
  key: K,
  params: AdminDestinations[K],
) => string

/**
 * History options for a destination navigation. Packaged pages that REDIRECT
 * (an alias route forwarding to its canonical page, a deep link that resolves
 * straight into another flow) pass `replace: true` so the intermediate URL
 * never lands in history — the same semantics a route-level redirect has.
 */
export interface AdminNavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean
}

/** Navigate to a destination key + params. Returned by {@link useAdminNavigate}. */
export type AdminDestinationNavigator = <K extends AdminDestinationKey>(
  key: K,
  params: AdminDestinations[K],
  options?: AdminNavigateOptions,
) => void

interface AdminNavigationContextValue {
  resolvers: Partial<AdminDestinationResolvers>
  navigate: (href: string, options?: AdminNavigateOptions) => void
}

const AdminNavigationContext = React.createContext<AdminNavigationContextValue | null>(null)

export interface AdminNavigationProviderProps {
  /**
   * Host resolver map for the destination keys the mounted packages declare.
   * Partial: any unbound key falls back to `#` (resolvers needing more than
   * path interpolation — search-param construction — stay host-owned).
   */
  resolvers: Partial<AdminDestinationResolvers>
  /**
   * Host-injected navigation primitive — typically the app router's
   * href-based navigate. Keeping it injected keeps this package
   * router-agnostic. Hosts should honor `options.replace` (map it onto the
   * router's history-replace mode) so packaged redirects behave like route
   * redirects; ignoring it only costs an extra history entry.
   */
  navigate: (href: string, options?: AdminNavigateOptions) => void
  children: React.ReactNode
}

/**
 * Provides destination resolution + navigation to packaged admin pages.
 * Hosts mount it once around the workspace (e.g. via `AdminWorkspaceShell`'s
 * `destinations` prop in `@voyant-travel/admin/app/workspace`).
 */
export function AdminNavigationProvider({
  resolvers,
  navigate,
  children,
}: AdminNavigationProviderProps) {
  const value = React.useMemo(() => ({ resolvers, navigate }), [resolvers, navigate])

  return <AdminNavigationContext.Provider value={value}>{children}</AdminNavigationContext.Provider>
}

/** Keys already warned about — unresolvable destinations warn once, not per render. */
const warnedDestinationKeys = new Set<string>()

function warnOnce(key: string, message: string, ...rest: ReadonlyArray<unknown>): void {
  if (warnedDestinationKeys.has(key)) return
  warnedDestinationKeys.add(key)
  console.warn(message, ...rest)
}

/**
 * Resolve a destination to an href, or `null` when unresolvable (no provider,
 * no resolver for the key, or a throwing resolver). Never throws — these run
 * in render paths, and a broken link must not take the page down with it.
 */
function resolveDestinationHref(
  context: AdminNavigationContextValue | null,
  key: string,
  params: unknown,
): string | null {
  if (!context) {
    warnOnce(
      key,
      `[voyant-admin] Destination "${key}" was resolved outside an <AdminNavigationProvider>; falling back to "#".`,
    )
    return null
  }

  const resolver = (context.resolvers as Record<string, ((params: never) => string) | undefined>)[
    key
  ]
  if (!resolver) {
    warnOnce(
      key,
      `[voyant-admin] No resolver registered for destination "${key}"; falling back to "#". Add it to the host's AdminNavigationProvider resolvers.`,
    )
    return null
  }

  try {
    return resolver(params as never)
  } catch (error) {
    warnOnce(
      key,
      `[voyant-admin] Resolver for destination "${key}" threw; falling back to "#".`,
      error,
    )
    return null
  }
}

/**
 * Resolve destination keys to hrefs (for `<a href>` / link props). When a key
 * cannot be resolved, warns once per key and returns `"#"` — render paths
 * never throw over a missing link target.
 */
export function useAdminHref(): AdminHrefResolver {
  const context = React.useContext(AdminNavigationContext)

  return React.useCallback<AdminHrefResolver>(
    (key, params) => resolveDestinationHref(context, key, params) ?? "#",
    [context],
  )
}

/**
 * Navigate to a destination: resolve the href, then call the host-injected
 * `navigate`. When the key cannot be resolved, warns once per key and no-ops.
 */
export function useAdminNavigate(): AdminDestinationNavigator {
  const context = React.useContext(AdminNavigationContext)

  return React.useCallback<AdminDestinationNavigator>(
    (key, params, options) => {
      const href = resolveDestinationHref(context, key, params)
      if (href === null || context === null) return
      context.navigate(href, options)
    },
    [context],
  )
}
