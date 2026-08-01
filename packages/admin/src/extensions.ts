// agent-quality: file-size exception -- owner: admin; extension contribution contracts and registry resolution remain co-located until a dedicated contract-module split preserves the public API.
import type { QueryClient } from "@tanstack/react-query"
import type * as React from "react"

import type { AdminDestinationKey, AdminDestinations } from "./navigation/destinations.js"
import type { AdminNavigationPreferencesContribution } from "./navigation/preferences.js"
import type { OperatorAdminMessages } from "./providers/operator-admin-messages.js"
import type { NavItem } from "./types.js"

/** Host-localized inputs available to graph-selected package admin factories. */
export interface SelectedAdminExtensionFactoryContext {
  navMessages: Readonly<Record<string, string>>
}

/** Uniform factory shape lowered into the selected-graph admin bundle. */
export type SelectedAdminExtensionFactory = (
  context: SelectedAdminExtensionFactoryContext,
) => AdminExtension

/**
 * App-supplied runtime handed to route loaders: where the API lives and how
 * to reach it (the host's cookie-forwarding fetcher in SSR setups).
 *
 * The fetcher takes a string URL — the `VoyantFetcher` convention every
 * `*-react` data client uses — so host fetchers typed against that contract
 * (and the global `fetch`, which accepts a superset of inputs) bind directly.
 */
export interface AdminRouteRuntime {
  baseUrl: string
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>
}

export interface AdminRouteLoaderContext {
  queryClient: QueryClient
  runtime: AdminRouteRuntime
  /**
   * Path params of the matched route (e.g. `{ id: "book_..." }`). Empty for
   * param-less routes. Hosts that bind contributions into a router supply
   * the matched params so package loaders can prefetch detail data.
   */
  params: Record<string, string>
}

/**
 * Props a packaged route page receives from the host's route binder
 * (packaged-admin RFC §4.2 endgame). The binder reads route state off the
 * matched route — `useParams`/`useSearch` — and hands it to the page, which
 * is what dissolves the old "zero-prop components only" restriction: a
 * param-taking page is just a page that reads `params`/`search` from props.
 */
export interface AdminRoutePageProps {
  /** Path params of the matched route (e.g. `{ id: "book_..." }`). */
  params: Record<string, string>
  /**
   * Search params of the matched route, already validated by the
   * contribution's `validateSearch`. Pages narrow this to their own search
   * contract (the same schema the contribution carries).
   */
  search: Record<string, unknown>
  /**
   * Patch the route's URL search state in place (same-route navigation).
   * Defaults to `replace: true` — filter/tab state shouldn't grow history.
   */
  updateSearch: (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>,
    options?: { replace?: boolean },
  ) => void
  /** Localized route title from the contribution (factory `labels`). */
  title?: string
}

export type AdminRoutePageComponent = React.ComponentType<AdminRoutePageProps>

/** Module shape `AdminUiRouteContribution.page` loaders resolve to. */
export interface AdminRoutePageModule {
  default: AdminRoutePageComponent
}

export interface AdminRouteMessagesProviderProps {
  children: React.ReactNode
  locale: string | null | undefined
  timeZone?: string | null
}

export type AdminRouteMessagesProvider = React.ComponentType<AdminRouteMessagesProviderProps>

export interface AdminRouteMessagesProviderModule {
  default: AdminRouteMessagesProvider
}

/**
 * Adapt a component into an {@link AdminRoutePageModule}. Use inside `page`
 * loaders for components that ignore route props entirely (zero-prop hosts)
 * or take an all-optional props bag — both of which TypeScript's weak-type
 * rule rejects as `AdminRoutePageComponent` despite being safe to mount.
 */
export function adminRoutePageModule<P>(component: React.ComponentType<P>): AdminRoutePageModule {
  const Component = component as React.ComponentType<AdminRoutePageProps>
  return { default: Component }
}

/**
 * A named route contribution for the admin shell.
 *
 * Originally metadata only; as of the packaged-admin RFC Phase 2
 * (docs/architecture/packaged-admin-rfc.md §4.2) contributions may carry the
 * route IMPLEMENTATION — everything a starter route file can express — so
 * domain packages can ship pages. All implementation fields are optional:
 * metadata-only contributions remain valid, and hosts decide how the fields
 * map onto their router (TanStack hosts spread them into route options).
 */
export interface AdminUiRouteContribution {
  id: string
  path: string
  title: string
  /** The page. Keep it lazy-importable for code-splitting. */
  component?: React.ComponentType
  /**
   * The page as a LAZY module loader (preferred over `component`). The host
   * binder wraps it in the router's lazy-component machinery, so the page
   * lands in its own chunk instead of the workspace-chrome chunk, and
   * hover/intent preloading fetches it ahead of navigation. The resolved
   * component receives {@link AdminRoutePageProps} (params/search/title), so
   * param-taking pages need no host route file.
   */
  page?: () => Promise<AdminRoutePageModule>
  /** Data loader; receives the host QueryClient + app runtime. */
  loader?: (ctx: AdminRouteLoaderContext) => unknown
  /**
   * Route-local package i18n provider. Keep this lazy: app shells can
   * localize package pages without pulling every domain message table into
   * the workspace chrome chunk.
   */
  routeMessagesProvider?: () => Promise<AdminRouteMessagesProviderModule>
  /** Typed search-param validation (e.g. a zod schema's parse). */
  validateSearch?: (search: Record<string, unknown>) => unknown
  /** Per-route SSR mode, mirroring the host router's option. */
  ssr?: boolean | "data-only"
  pendingComponent?: React.ComponentType
  errorComponent?: React.ComponentType<{ error: unknown; reset: () => void }>
  /** Capability/permission key the shell checks before rendering. */
  capability?: string
  /** Preload policy override, mirroring the host router's option. */
  preload?: false | "intent" | "render" | "viewport"
  /**
   * The semantic destination key this route SATISFIES (packaged-admin RFC
   * §4.7 endgame). Declare it only when the destination's semantics map 1:1
   * onto this route's path with pure param interpolation — the binding lets
   * `voyant admin generate --destinations` emit the host's resolver for the
   * key instead of the host hand-writing it. Destinations that need search
   * params, multiple candidate routes, or any construction beyond path
   * interpolation must NOT be bound here; their resolvers stay hand-written
   * in the host map. The key must be declared on {@link AdminDestinations}
   * (by this package or one whose augmentation is in scope), which keeps the
   * annotation typo-proof.
   */
  destination?: AdminDestinationKey
  /**
   * Route param name → destination param name, for params whose names
   * differ (e.g. route `/suppliers/$id` satisfying
   * `"supplier.detail": { supplierId: string }` maps `{ id: "supplierId" }`).
   * Params absent from the map keep their route name. Only meaningful next
   * to {@link AdminUiRouteContribution.destination}.
   */
  destinationParams?: Record<string, string>
  /**
   * Redirect target: the route navigates here instead of rendering
   * (host binders emit a `beforeLoad`-style redirect, which also covers
   * SSR). A redirect contribution needs no `page`/`component` — it counts
   * as implemented on its own. Used for the index redirects that used to be
   * host route files (e.g. `/catalog` → `/catalog/products`).
   */
  redirectTo?: string
  /**
   * Nested child contributions rendered inside this route's layout (this
   * contribution becomes a LAYOUT route — its page renders an outlet).
   * Child `path`s are RELATIVE to the parent path and start with `/`;
   * a child path of exactly `"/"` is the parent's index route. Hosts bind
   * children under the parent's code-based route (packaged-admin RFC §4.8 —
   * see `attachAdminExtensionRoutes` / `adminExtensionChildRoutes` in
   * `@voyant-travel/admin/app`).
   */
  children?: ReadonlyArray<AdminUiRouteContribution>
}

/**
 * Contribute one or more navigation items to the shared admin shell.
 *
 * Contributions are appended after the starter's base navigation and sorted
 * by `order`. Set `insertAfter` to a base nav item id to splice the
 * contribution's items in directly after that item instead — useful when
 * the extension's items belong logically next to a built-in entry (e.g.
 * Trips below Bookings).
 */
export interface AdminNavigationContribution {
  items: ReadonlyArray<NavItem>
  order?: number
  insertAfter?: string
}

/**
 * Named widget slot identifier.
 *
 * Starters define the slots they expose on specific admin pages and modules
 * or extensions can target them with React components.
 */
export type AdminWidgetSlot = string

/**
 * A widget contribution that can be rendered inside a starter-defined slot.
 */
export interface AdminWidgetContribution<Props = Record<string, unknown>> {
  id: string
  slot: AdminWidgetSlot
  order?: number
  component: React.ComponentType<Props>
}

/** Heterogeneous widget contribution after slot-specific props are type-checked. */
export type AnyAdminWidgetContribution = AdminWidgetContribution<never>

export type AdminSettingsNavGroup = "general" | "products"

/** Icon contract used by selected package settings contributions. */
export type AdminSettingsNavIcon = React.ComponentType<{ className?: string }>

/**
 * A package-owned page mounted below the shared `/settings` layout.
 *
 * Selected package factories contribute these alongside their normal routes;
 * the host folds them into the core settings route after graph selection, so
 * route metadata, copy, icons, and loaders stay with the owning package.
 */
export interface AdminSettingsPageContribution {
  id: string
  /** Path relative to the settings base path, starting with `/`. */
  path: string
  title: string
  label?: string | ((messages: OperatorAdminMessages) => string)
  icon?: AdminSettingsNavIcon
  group?: AdminSettingsNavGroup
  order?: number
  page: () => Promise<AdminRoutePageModule>
  loader?: (ctx: AdminRouteLoaderContext) => unknown
  routeMessagesProvider?: () => Promise<AdminRouteMessagesProviderModule>
  ssr?: boolean | "data-only"
}

export interface AdminSetupStepMessages {
  title: string
  description: string
  action: string
}

export interface AdminSetupStepActionProps {
  label: string
  prefill: unknown
}

const ADMIN_SETUP_STEP_PARAM = "voyantSetupStep"
const ADMIN_SETUP_PREFILL_PREFIX = "voyant.setup.prefill:"

/** Add a non-sensitive step marker to a setup destination URL. */
export function createAdminSetupPrefillHref(href: string, stepId: string): string {
  const url = new URL(href, "https://voyant.invalid")
  url.searchParams.set(ADMIN_SETUP_STEP_PARAM, stepId)
  return `${url.pathname}${url.search}${url.hash}`
}

/** Keep opaque provisioning values out of URLs while navigating to an owned form. */
export function storeAdminSetupPrefill(
  stepId: string,
  value: unknown,
  storage: Pick<Storage, "setItem"> | undefined = browserSessionStorage(),
): void {
  if (value === undefined || !storage) return
  storage.setItem(`${ADMIN_SETUP_PREFILL_PREFIX}${stepId}`, JSON.stringify(value))
}

/** Consume prefill only when the current URL explicitly identifies the expected setup step. */
export function consumeAdminSetupPrefill(
  stepId: string,
  search: string | undefined = browserLocationSearch(),
  storage: Pick<Storage, "getItem" | "removeItem"> | undefined = browserSessionStorage(),
): unknown {
  if (!search || !storage || new URLSearchParams(search).get(ADMIN_SETUP_STEP_PARAM) !== stepId) {
    return undefined
  }
  const key = `${ADMIN_SETUP_PREFILL_PREFIX}${stepId}`
  const serialized = storage.getItem(key)
  if (serialized === null) return undefined
  storage.removeItem(key)
  try {
    return JSON.parse(serialized) as unknown
  } catch {
    return undefined
  }
}

function browserSessionStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage
}

function browserLocationSearch(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.search
}

/** Package-owned guidance shown by the selected setup flow. */
export interface AdminSetupStepContribution {
  /** Globally stable package-owned identifier. */
  id: string
  order: number
  skippable: boolean
  messages: Readonly<Record<string, AdminSetupStepMessages>>
  /** Existing package surface used to carry out this step. */
  href?: string
  /** Use when the action must resolve a semantic destination. */
  actionComponent?: React.ComponentType<AdminSetupStepActionProps>
  /** Read-only domain predicate. The setup shell persists a positive result. */
  isComplete: (context: AdminRouteLoaderContext) => boolean | Promise<boolean>
  /** Validate or narrow the opaque provisioning value before handing it to the action. */
  prefill?: (value: unknown) => unknown
}

export interface AdminSetupInitializeInput {
  stepIds: readonly string[]
  fresh: boolean
}

export interface AdminSetupInitializeResult {
  redirectTo?: string
}

/** Package-owned setup persistence/controller attached to the selected admin graph. */
export interface AdminSetupFlowContribution {
  id: string
  /** Resolve whether the current actor may persist setup state. */
  canInitialize: (context: AdminRouteLoaderContext) => Promise<boolean>
  initialize: (
    context: AdminRouteLoaderContext,
    input: AdminSetupInitializeInput,
  ) => Promise<AdminSetupInitializeResult>
}

/** Shell chrome slot rendered in the workspace header's right action area. */
export const adminWorkspaceHeaderActionsSlot = "workspace.header.actions" satisfies AdminWidgetSlot

/**
 * Shared admin extension bundle.
 *
 * This keeps the extension surface explicit and typed without forcing a more
 * dynamic plugin runtime into starters.
 */
export interface AdminExtension {
  id: string
  navigation?: ReadonlyArray<AdminNavigationContribution>
  /**
   * Runtime navigation hook, merged AFTER static {@link navigation} as its own
   * appended sections. Unlike static `navigation` (declared at creation), this
   * lets an extension contribute nav items discovered at runtime — e.g. an
   * installed app's admin pages fetched via React Query. It IS a React hook
   * (may call `useQuery`), so the shell calls it unconditionally for every
   * extension in a stable order to honor the rules of hooks. Keep it fail-soft:
   * on a fetch error return `[]` rather than throwing.
   */
  useRuntimeNavItems?: () => ReadonlyArray<NavItem>
  /**
   * Runtime counterpart of {@link navigation}. This preserves declarative
   * ordering and anchoring for contributions discovered after installation.
   * It is a React hook and follows the same stability/fail-soft requirements as
   * {@link useRuntimeNavItems}. The older flat hook remains supported.
   */
  useRuntimeNavigation?: () => ReadonlyArray<AdminNavigationContribution>
  /** Final navigation-visibility source, evaluated after selected contributions merge. */
  navigationPreferences?: AdminNavigationPreferencesContribution
  routes?: ReadonlyArray<AdminUiRouteContribution>
  settingsPages?: ReadonlyArray<AdminSettingsPageContribution>
  setupSteps?: ReadonlyArray<AdminSetupStepContribution>
  setupFlow?: AdminSetupFlowContribution
  widgets?: ReadonlyArray<AnyAdminWidgetContribution>
}

export function defineAdminExtension<T extends AdminExtension>(extension: T): T {
  return extension
}

/**
 * Discover deployment-local admin extensions from a Vite `import.meta.glob`
 * (eager) of `src/admin/<name>/index.tsx` files — the admin-UI half of the
 * "extend without forking" seam (mirrors `modulesFromGlob`/`extensionsFromGlob`
 * on the API side). Each file's `default` export is an {@link AdminExtension}
 * (wrap it with {@link defineAdminExtension}); append the result to the shell's
 * extension registry so its nav, widgets, and routes auto-compose. Returns the
 * extensions in stable (path-sorted) order; empty until a deployment adds one.
 *
 * Vite compiles `import.meta.glob` to static imports at build time, so this is
 * Cloudflare-Workers-safe (no runtime module resolution).
 *
 *     // src/lib/admin-extensions.tsx
 *     export const discoveredAdminExtensions = adminExtensionsFromGlob(
 *       import.meta.glob("../admin/*\/index.tsx", { eager: true }),
 *     )
 *
 * @throws if a matched file has no default export.
 */
export function adminExtensionsFromGlob(glob: Record<string, unknown>): AdminExtension[] {
  return Object.entries(glob)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, namespace]) => {
      const declaration = (namespace as { default?: unknown }).default
      if (declaration == null) {
        throw new Error(
          `[voyant-admin] deployment admin extension "${path}" has no default export — ` +
            "add `export default defineAdminExtension(...)` to its index.tsx",
        )
      }
      return declaration as AdminExtension
    })
}

/**
 * A route contribution whose `component` is guaranteed present, typed as a
 * function component so it attaches directly to router `component:` options
 * (router component types reject the class side of `React.ComponentType`).
 */
export type BindableAdminRoute = Omit<AdminUiRouteContribution, "component"> & {
  component: React.FunctionComponent
}

/**
 * Look up a route contribution by id and assert it carries a component.
 *
 * This is the binding contract generated thin route files rely on
 * (`voyant admin generate --routes`, packaged-admin RFC §4.2): the generator
 * only emits hosts for zero-prop contributions whose `component` is present,
 * and the emitted file resolves the contribution through this helper so a
 * contribution that later loses its id or component fails loudly at module
 * evaluation (build/dev start) instead of rendering an empty route.
 */
export function requireAdminRoute(extension: AdminExtension, routeId: string): BindableAdminRoute {
  const route = extension.routes?.find((candidate) => candidate.id === routeId)
  if (!route) {
    throw new Error(
      `[voyant-admin] Extension "${extension.id}" has no route contribution "${routeId}". ` +
        `Regenerate the host's route files with \`voyant admin generate --routes\`.`,
    )
  }
  if (!route.component) {
    throw new Error(
      `[voyant-admin] Route contribution "${routeId}" of extension "${extension.id}" carries no component. ` +
        `Generated thin hosts require zero-prop components — regenerate with \`voyant admin generate --routes\`.`,
    )
  }
  return route as BindableAdminRoute
}

/**
 * A route contribution guaranteed to carry an implementation — a lazy
 * `page` module loader, an eager zero-prop `component`, or a `redirectTo`
 * target (redirect routes render nothing).
 */
export type ImplementedAdminRoute = AdminUiRouteContribution &
  (
    | { page: () => Promise<AdminRoutePageModule> }
    | { component: React.FunctionComponent }
    | { redirectTo: string }
  )

/**
 * Depth-first lookup of a route contribution by id, descending into
 * {@link AdminUiRouteContribution.children} so nested contributions (e.g.
 * settings pages under the settings layout) resolve like top-level ones.
 */
export function findAdminRouteContribution(
  routes: ReadonlyArray<AdminUiRouteContribution> | undefined,
  routeId: string,
): AdminUiRouteContribution | undefined {
  for (const route of routes ?? []) {
    if (route.id === routeId) return route
    const nested = findAdminRouteContribution(route.children, routeId)
    if (nested) return nested
  }
  return undefined
}

/**
 * Look up a route contribution by id (including nested `children`) and
 * assert it carries an implementation (`page`, `component`, or
 * `redirectTo`).
 *
 * This is the binding contract of the code-assembled admin route tree
 * (packaged-admin RFC §4.8 endgame): the host's generated route module
 * resolves every extension route through this helper, so a contribution
 * that later loses its id or implementation fails loudly at module
 * evaluation (build/dev start) instead of rendering an empty route.
 */
export function requireImplementedAdminRoute(
  extension: AdminExtension,
  routeId: string,
): ImplementedAdminRoute {
  const route = findAdminRouteContribution(extension.routes, routeId)
  if (!route) {
    throw new Error(
      `[voyant-admin] Extension "${extension.id}" has no route contribution "${routeId}". ` +
        `Regenerate the host's admin route module with \`voyant admin generate --routes\`.`,
    )
  }
  if (!route.page && !route.component && !route.redirectTo) {
    throw new Error(
      `[voyant-admin] Route contribution "${routeId}" of extension "${extension.id}" carries no ` +
        `implementation (neither \`page\`, \`component\`, nor \`redirectTo\`). Add one to the ` +
        `extension, or keep the route as a hand-written host route file.`,
    )
  }
  return route as ImplementedAdminRoute
}

/**
 * Compose an explicit admin extension registry for a starter or app shell.
 *
 * The admin surface stays source-controlled and typed while still routing
 * all contributions through the shared admin runtime package.
 */
export function createAdminExtensionRegistry(
  ...extensions: ReadonlyArray<AdminExtension>
): ReadonlyArray<AdminExtension> {
  return extensions
}

/** Resolve only the setup steps present in the composed selected extension set. */
export function resolveAdminSetupSteps(
  extensions: ReadonlyArray<AdminExtension>,
): AdminSetupStepContribution[] {
  const steps = extensions.flatMap((extension) => extension.setupSteps ?? [])
  const seen = new Set<string>()
  for (const step of steps) {
    if (seen.has(step.id)) {
      throw new Error(`[voyant-admin] Duplicate setup step id "${step.id}".`)
    }
    seen.add(step.id)
  }
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => a.step.order - b.step.order || a.index - b.index)
    .map(({ step }) => step)
}

/** A composed admin may select one setup-state owner. */
export function resolveAdminSetupFlow(
  extensions: ReadonlyArray<AdminExtension>,
): AdminSetupFlowContribution | undefined {
  const flows = extensions.flatMap((extension) =>
    extension.setupFlow ? [extension.setupFlow] : [],
  )
  if (flows.length > 1) {
    throw new Error(
      `[voyant-admin] Expected one setup flow contribution, received: ${flows
        .map((flow) => flow.id)
        .join(", ")}.`,
    )
  }
  return flows[0]
}

type OrderedValue<T> = {
  index: number
  order: number
  value: T
}

function sortOrderedValues<T>(values: ReadonlyArray<OrderedValue<T>>): T[] {
  return [...values]
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order
      }

      return a.index - b.index
    })
    .map((entry) => entry.value)
}

export interface ResolveAdminNavigationOptions {
  baseItems: ReadonlyArray<NavItem>
  extensions?: ReadonlyArray<AdminExtension>
}

export function resolveAdminNavigation({
  baseItems,
  extensions = [],
}: ResolveAdminNavigationOptions): NavItem[] {
  const contributions = extensions.flatMap((extension) => extension.navigation ?? [])
  const orderedContributions = sortOrderedValues(
    contributions.map((contribution, index) => ({
      index,
      order: contribution.order ?? 0,
      value: contribution,
    })),
  )

  const anchoredByBaseId = new Map<string, NavItem[]>()
  const appended: NavItem[] = []
  for (const contribution of orderedContributions) {
    if (contribution.insertAfter) {
      const bucket = anchoredByBaseId.get(contribution.insertAfter) ?? []
      bucket.push(...contribution.items)
      anchoredByBaseId.set(contribution.insertAfter, bucket)
    } else {
      appended.push(...contribution.items)
    }
  }

  const merged: NavItem[] = []
  for (const item of baseItems) {
    merged.push(item)
    if (!item.id) continue
    const anchored = anchoredByBaseId.get(item.id)
    if (anchored) merged.push(...anchored)
  }
  // Items anchored to a base id that no longer exists fall through to the
  // tail so they're still discoverable rather than silently dropped.
  for (const [baseId, items] of anchoredByBaseId.entries()) {
    if (!baseItems.some((item) => item.id === baseId)) appended.push(...items)
  }
  return [...merged, ...appended]
}

export interface ResolveAdminWidgetsOptions {
  slot: AdminWidgetSlot
  extensions?: ReadonlyArray<AdminExtension>
}

export function resolveAdminWidgets({
  slot,
  extensions = [],
}: ResolveAdminWidgetsOptions): AnyAdminWidgetContribution[] {
  const widgets = extensions
    .flatMap((extension) => extension.widgets ?? [])
    .filter((widget) => widget.slot === slot)

  return sortOrderedValues(
    widgets.map((widget, index) => ({
      index,
      order: widget.order ?? 0,
      value: widget,
    })),
  )
}
