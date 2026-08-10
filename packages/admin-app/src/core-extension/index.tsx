// Lean static only: the dashboard skeleton (pending boundary). Every page —
// dashboard (recharts), account, and the settings pages — resolves through
// dynamic imports of SPECIFIC modules (never barrels) inside `page`/`loader`
// thunks, so the heavy chunks load on navigation, not with workspace chrome.
import { DashboardSkeleton } from "@voyant-travel/admin/dashboard/skeleton"
import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminSettingsPageContribution,
  type AdminUiRouteContribution,
  adminRoutePageModule,
  defineAdminExtension,
} from "@voyant-travel/admin/extensions"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"

import {
  type AdminCoreSettingsExtraNavEntry,
  type AdminCoreSettingsPageId,
  adminCoreSettingsNavEntries,
} from "./settings-nav.js"

export type {
  AdminCoreSettingsNavGroup,
  AdminCoreSettingsNavIcon,
  AdminCoreSettingsPageId,
} from "./settings-nav.js"

/**
 * The CORE admin extension (packaged-admin RFC §4.2/§4.8): the pages every
 * Voyant admin ships regardless of mounted domains — the dashboard host,
 * the account page, and the settings area (layout + built-in pages). These
 * were the last starter-owned operator pages; they now arrive as
 * extension route contributions bound through the host's code-assembled
 * route tree, exactly like the domain extensions.
 *
 * NAVIGATION: deliberately none — Dashboard and Settings are part of the
 * BASE operator navigation (`createOperatorAdminNavigation` in
 * `@voyant-travel/admin`), and Account is linked from the user menu.
 *
 * ROUTES:
 * - `/` — the dashboard (`DashboardPage` from `@voyant-travel/admin/dashboard`,
 *   kept behind a lazy page module because it pulls recharts). Data comes
 *   from the page's own client-side queries; hosts with SSR aggregates
 *   supply a loader via {@link AdminCoreDashboardOptions.loader} (the
 *   loader and the page share the dashboard query keys).
 * - `/account` — `AccountPage` from `@voyant-travel/auth-react`, with its lazy
 *   route-local `AuthUiMessagesProvider` metadata owned here.
 * - `/settings` — layout route (grouped sub-nav + outlet) with nested
 *   children (the first nested contributions — hosts bind them via
 *   `adminExtensionRouteOptions` for the statically known children plus
 *   `adminExtensionChildRoutes` for app-supplied {@link
 *   AdminCoreSettingsOptions.extraPages}): an index redirect and eight
 *   built-in pages (API tokens, channels, taxes, cost categories,
 *   pricing categories, price catalogs, product types, product tags).
 *
 * EJECTION/DISABLING: pass `false` for a surface (`dashboard`, `account`,
 * `settings`) to drop its contributions entirely (then own the route in
 * the host), or `settings.omit` to drop individual built-in settings pages.
 */
export interface CreateAdminCoreExtensionOptions {
  /** `false` ejects the dashboard route from the extension. */
  dashboard?: false | AdminCoreDashboardOptions
  /** `false` ejects the account route from the extension. */
  account?: false | AdminCoreAccountOptions
  /** `false` ejects the whole settings area from the extension. */
  settings?: false | AdminCoreSettingsOptions
}

export interface AdminCoreDashboardOptions {
  /**
   * App-supplied data loader (e.g. server-function aggregates that read the
   * database directly during SSR). Must populate the dashboard query keys
   * (`dashboardQueryKeys` from `@voyant-travel/admin/dashboard/query-options`);
   * without it the page fetches client-side through the admin API.
   */
  loader?: (ctx: AdminRouteLoaderContext) => unknown
  /** Per-route SSR mode. Default `"data-only"`. */
  ssr?: boolean | "data-only"
}

export interface AdminCoreAccountOptions {
  /** Per-route SSR mode. Default: inherit the router/parent default. */
  ssr?: boolean | "data-only"
}

export interface AdminCoreSettingsOptions {
  /** Mount path of the settings area. Default `/settings`. */
  basePath?: string
  /** Lazily load the deployment-selected catalog for permission-editing pages. */
  loadAccessCatalog?: () => Promise<AccessCatalog>
  /**
   * Where the settings index redirects. Default `<basePath>/channels`
   * (skipped automatically when `channels` is omitted — then the first
   * remaining built-in page wins).
   */
  indexRedirectTo?: string
  /** Built-in settings pages to drop (route + nav entry). */
  omit?: ReadonlyArray<AdminCoreSettingsPageId>
  /**
   * App-custom settings pages: spliced into the layout's sub-navigation
   * and bound as child routes of the settings layout. Hosts bind them at
   * runtime via `adminExtensionChildRoutes` (they are invisible to
   * `voyant admin generate --routes`, so they get no typed-link entries).
   */
  extraPages?: ReadonlyArray<AdminCoreSettingsExtraPage>
}

export type AdminCoreSettingsExtraPage = AdminSettingsPageContribution

/** Default fetcher for the built-in settings loaders (cookie-authenticated). */
const coreFetcher = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init })

function coreClient(ctx: AdminRouteLoaderContext) {
  return { baseUrl: ctx.runtime.baseUrl, fetcher: ctx.runtime.fetcher ?? coreFetcher }
}

export function createAdminCoreExtension(
  options: CreateAdminCoreExtensionOptions = {},
): AdminExtension {
  const { dashboard = {}, account = {}, settings = {} } = options
  const routes: AdminUiRouteContribution[] = []

  if (dashboard !== false) {
    routes.push({
      id: "core-dashboard",
      path: "/",
      title: "Dashboard",
      ssr: dashboard.ssr ?? "data-only",
      // DashboardPage pulls recharts — the lazy page module keeps it out of
      // the workspace-chrome chunk that evaluates this factory.
      page: () =>
        import("@voyant-travel/admin/dashboard").then((module) =>
          adminRoutePageModule(module.DashboardPage),
        ),
      loader: dashboard.loader,
      pendingComponent: DashboardSkeleton,
    })
  }

  if (account !== false) {
    routes.push({
      id: "core-account",
      path: "/account",
      title: "Account",
      ssr: account.ssr,
      page: async () => {
        const { AccountPage } = await import("@voyant-travel/auth-react/account")
        // The workspace inset header already renders the sidebar trigger —
        // suppress the page shell's own to avoid doubling it.
        function CoreAccountPage() {
          return <AccountPage showSidebarTrigger={false} />
        }
        return { default: CoreAccountPage }
      },
      routeMessagesProvider: () =>
        import("@voyant-travel/auth-react/i18n").then((module) => ({
          default: module.AuthUiMessagesProvider,
        })),
    })
  }

  if (settings !== false) {
    routes.push(createSettingsContribution(settings))
  }

  return defineAdminExtension({ id: "core", routes })
}

function createSettingsContribution(options: AdminCoreSettingsOptions): AdminUiRouteContribution {
  const { basePath = "/settings", omit = [] } = options
  const extraPages = uniqueExtraSettingsPages(options.extraPages ?? [])
  const entries = adminCoreSettingsNavEntries.filter((entry) => !omit.includes(entry.id))
  const indexRedirectTo =
    options.indexRedirectTo ??
    (entries.some((entry) => entry.id === "channels")
      ? `${basePath}/channels`
      : `${basePath}${entries[0]?.path ?? "/channels"}`)

  const extras: AdminCoreSettingsExtraNavEntry[] = extraPages.map((page) => ({
    id: page.id,
    href: `${basePath}${page.path}`,
    icon: page.icon,
    group: page.group ?? "general",
    order: page.order ?? 100,
    label: page.label ?? page.title,
  }))

  const children: AdminUiRouteContribution[] = [
    {
      id: "core-settings-index",
      path: "/",
      title: "Settings",
      redirectTo: indexRedirectTo,
    },
    ...entries.map((entry) => createBuiltInSettingsPage(entry.id, options.loadAccessCatalog)),
    ...extraPages.map((page) => ({
      id: `core-settings-${page.id}`,
      path: page.path,
      title: page.title,
      page: page.page,
      loader: page.loader,
      routeMessagesProvider: page.routeMessagesProvider,
      ssr: page.ssr,
    })),
  ]

  return {
    id: "core-settings",
    path: basePath,
    title: "Settings",
    page: async () => {
      const { AdminCoreSettingsLayout } = await import("./settings-layout.js")
      function CoreSettingsLayoutPage() {
        return <AdminCoreSettingsLayout basePath={basePath} omit={omit} extras={extras} />
      }
      return { default: CoreSettingsLayoutPage }
    },
    children,
  }
}

function uniqueExtraSettingsPages(
  pages: ReadonlyArray<AdminCoreSettingsExtraPage>,
): ReadonlyArray<AdminCoreSettingsExtraPage> {
  const unique = new Map<string, AdminCoreSettingsExtraPage>()
  for (const page of pages) {
    const key = `${page.id}\0${page.path}`
    if (!unique.has(key)) unique.set(key, page)
  }
  return [...unique.values()]
}

function createBuiltInSettingsPage(
  id: AdminCoreSettingsPageId,
  loadAccessCatalog?: () => Promise<AccessCatalog>,
): AdminUiRouteContribution {
  const entry = adminCoreSettingsNavEntries.find((candidate) => candidate.id === id)
  if (!entry) {
    throw new Error(`[voyant-admin] Unknown core settings page "${id}".`)
  }
  const base = { id: `core-settings-${id}`, path: entry.path, title: entry.defaultTitle }

  switch (id) {
    case "api-tokens":
      return {
        ...base,
        routeMessagesProvider: () =>
          import("@voyant-travel/auth-react/i18n").then((module) => ({
            default: module.AuthUiMessagesProvider,
          })),
        page: () =>
          Promise.all([
            import("@voyant-travel/auth-react/components/service-api-keys-page"),
            loadAccessCatalog?.(),
          ]).then(([module, accessCatalog]) => {
            function ApiTokensPage() {
              return <module.ApiTokensPage accessCatalog={accessCatalog} />
            }
            return adminRoutePageModule(ApiTokensPage)
          }),
      }
    case "channels":
      return {
        ...base,
        ssr: "data-only",
        routeMessagesProvider: () =>
          import("@voyant-travel/distribution-react/i18n").then((module) => ({
            default: module.DistributionUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/distribution-react/components/channels-page").then((module) =>
            adminRoutePageModule(module.ChannelsPage),
          ),
        // Dynamic import on purpose: the query options pull the domain data
        // layer (client + response schemas), and a static import here would
        // pin it into the workspace-chrome chunk evaluating this factory.
        loader: async (ctx: AdminRouteLoaderContext) => {
          const { getChannelsQueryOptions } = await import("@voyant-travel/distribution-react")
          return ctx.queryClient.ensureQueryData(
            getChannelsQueryOptions(coreClient(ctx), { limit: 25, offset: 0 }),
          )
        },
      }
    case "invoicing":
      return {
        ...base,
        routeMessagesProvider: () =>
          import("@voyant-travel/finance-react/i18n").then((module) => ({
            default: module.FinanceUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/finance-react/components/invoicing-page").then((module) =>
            adminRoutePageModule(module.InvoicingPage),
          ),
      }
    case "taxes":
      return {
        ...base,
        routeMessagesProvider: () =>
          import("@voyant-travel/finance-react/i18n").then((module) => ({
            default: module.FinanceUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/finance-react/components/taxes-page").then((module) =>
            adminRoutePageModule(module.TaxesPage),
          ),
      }
    case "cost-categories":
      return {
        ...base,
        routeMessagesProvider: () =>
          import("@voyant-travel/finance-react/i18n").then((module) => ({
            default: module.FinanceUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/finance-react/components/cost-categories-page").then((module) =>
            adminRoutePageModule(module.CostCategoriesPage),
          ),
      }
    case "pricing-categories":
      return {
        ...base,
        ssr: "data-only",
        routeMessagesProvider: () =>
          import("@voyant-travel/commerce-react/i18n").then((module) => ({
            default: module.CommerceUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/commerce-react/pricing/components/pricing-categories-page").then(
            (module) => adminRoutePageModule(module.PricingCategoriesPage),
          ),
        loader: async (ctx: AdminRouteLoaderContext) => {
          const { getPricingCategoriesQueryOptions } = await import(
            "@voyant-travel/commerce-react/pricing"
          )
          return ctx.queryClient.ensureQueryData(
            getPricingCategoriesQueryOptions(coreClient(ctx), { limit: 25, active: undefined }),
          )
        },
      }
    case "price-catalogs":
      return {
        ...base,
        ssr: "data-only",
        routeMessagesProvider: () =>
          import("@voyant-travel/commerce-react/i18n").then((module) => ({
            default: module.CommerceUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/commerce-react/pricing/components/price-catalogs-page").then(
            (module) => adminRoutePageModule(module.PriceCatalogsPage),
          ),
        loader: async (ctx: AdminRouteLoaderContext) => {
          const { getPriceCatalogsQueryOptions } = await import(
            "@voyant-travel/commerce-react/pricing"
          )
          return ctx.queryClient.ensureQueryData(
            getPriceCatalogsQueryOptions(coreClient(ctx), { limit: 25, offset: 0 }),
          )
        },
      }
    case "product-types":
      return {
        ...base,
        ssr: "data-only",
        routeMessagesProvider: () =>
          import("@voyant-travel/inventory-react/i18n").then((module) => ({
            default: module.ProductsUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/inventory-react/components/product-types-page").then((module) =>
            adminRoutePageModule(module.ProductTypesPage),
          ),
        loader: async (ctx: AdminRouteLoaderContext) => {
          const { getProductTypesQueryOptions } = await import("@voyant-travel/inventory-react")
          return ctx.queryClient.ensureQueryData(
            getProductTypesQueryOptions(coreClient(ctx), { limit: 25, offset: 0 }),
          )
        },
      }
    case "product-tags":
      return {
        ...base,
        ssr: "data-only",
        routeMessagesProvider: () =>
          import("@voyant-travel/inventory-react/i18n").then((module) => ({
            default: module.ProductsUiMessagesProvider,
          })),
        page: () =>
          import("@voyant-travel/inventory-react/components/product-tags-page").then((module) =>
            adminRoutePageModule(module.ProductTagsPage),
          ),
        loader: async (ctx: AdminRouteLoaderContext) => {
          const { getProductTagsQueryOptions } = await import("@voyant-travel/inventory-react")
          return ctx.queryClient.ensureQueryData(
            getProductTagsQueryOptions(coreClient(ctx), { limit: 25, offset: 0 }),
          )
        },
      }
  }
}
