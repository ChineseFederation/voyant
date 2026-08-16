import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  adminRoutePageModule,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
} from "@voyant-travel/admin/extensions"
import { Building2, Globe, Store, Users } from "lucide-react"
import { authTeamSetupMessageDefinitions } from "./i18n/setup.js"

/** Selected-graph team settings contribution owned by Auth React. */
export function createSelectedAuthTeamAdminExtension(
  context?: SelectedAdminExtensionFactoryContext,
): AdminExtension {
  const label = context?.navMessages.team ?? authTeamSetupMessageDefinitions.en.navigationLabel
  return defineAdminExtension({
    id: "auth-team",
    settingsPages: [
      {
        id: "team",
        path: "/team",
        title: label,
        label,
        icon: Users,
        group: "general",
        order: 20,
        page: () =>
          import("./components/team-management-page.js").then((module) =>
            adminRoutePageModule(module.TeamManagementPage),
          ),
        routeMessagesProvider: () =>
          import("./i18n/index.js").then((module) => ({ default: module.AuthUiMessagesProvider })),
      },
    ],
    setupSteps: [
      {
        id: "@voyant-travel/auth#setup.team",
        order: 60,
        skippable: true,
        href: "/settings/team",
        messages: authTeamSetupMessageDefinitions,
        isComplete: hasAdditionalTeamMember,
      },
    ],
  })
}

/** Selected-graph customer business-account operations owned by Auth React. */
export function createSelectedCustomerBusinessAccountsAdminExtension(
  context?: SelectedAdminExtensionFactoryContext,
): AdminExtension {
  const label = context?.navMessages.businessAccounts ?? "Business accounts"
  return defineAdminExtension({
    id: "customer-business-accounts",
    navigation: [
      {
        order: 45,
        items: [
          {
            id: "customer-business-accounts",
            title: label,
            url: "/business-accounts",
            icon: Building2,
          },
        ],
      },
    ],
    routes: [
      {
        id: "customer-business-accounts",
        path: "/business-accounts",
        title: label,
        ssr: "data-only",
        page: () =>
          import("./components/customer-business-accounts-page.js").then((module) =>
            adminRoutePageModule(module.CustomerBusinessAccountsPage),
          ),
        loader: loadCustomerBusinessAccounts,
        routeMessagesProvider: () =>
          import("./i18n/index.js").then((module) => ({
            default: module.AuthUiMessagesProvider,
          })),
      },
    ],
  })
}

/**
 * Selected-graph "Public API" and "Customer accounts" admin surfaces owned by
 * Auth React.
 *
 * One extension, two surfaces, because retiring the storefront entity
 * (voyant#4624) split what the "Storefronts" page conflated: the credentials a
 * frontend presents, and how customers sign in. The former "Sites" sub-view
 * stays a seam whatever fills the runtime port can plug into.
 */
export function createSelectedPublicApiAdminExtension(
  context?: SelectedAdminExtensionFactoryContext,
): AdminExtension {
  const publicApiLabel = context?.navMessages.publicApi ?? "Public API"
  const customerAccountsLabel = context?.navMessages.customerAccounts ?? "Customer accounts"
  const sitesLabel = context?.navMessages.publicApiSites ?? "Sites"
  const routeMessagesProvider = () =>
    import("./i18n/index.js").then((module) => ({ default: module.AuthUiMessagesProvider }))
  return defineAdminExtension({
    id: "public-api",
    navigation: [
      {
        order: 46,
        items: [
          {
            id: "public-api",
            title: publicApiLabel,
            url: "/public-api",
            icon: Store,
            items: [
              { id: "public-api-keys", title: publicApiLabel, url: "/public-api", icon: Store },
              { id: "public-api-sites", title: sitesLabel, url: "/public-api/sites", icon: Globe },
            ],
          },
          {
            id: "customer-accounts",
            title: customerAccountsLabel,
            url: "/customer-accounts",
            icon: Users,
          },
        ],
      },
    ],
    routes: [
      {
        id: "public-api",
        path: "/public-api",
        title: publicApiLabel,
        ssr: "data-only",
        page: () =>
          import("./components/public-api-page.js").then((module) =>
            adminRoutePageModule(module.PublicApiPage),
          ),
        loader: loadPublicApi,
        routeMessagesProvider,
      },
      {
        // The sites seam renames with the module; the concept it exposes
        // belongs to whatever fills the runtime port.
        id: "public-api-sites",
        path: "/public-api/sites",
        title: sitesLabel,
        ssr: "data-only",
        page: () =>
          import("./components/public-api-sites-page.js").then((module) =>
            adminRoutePageModule(module.PublicApiSitesPage),
          ),
        routeMessagesProvider,
      },
      {
        id: "customer-accounts",
        path: "/customer-accounts",
        title: customerAccountsLabel,
        ssr: "data-only",
        page: () =>
          import("./components/customer-accounts-page.js").then((module) =>
            adminRoutePageModule(module.CustomerAccountsPage),
          ),
        loader: loadCustomerAccounts,
        routeMessagesProvider,
      },
    ],
  })
}

async function loadPublicApi({ queryClient, runtime }: AdminRouteLoaderContext): Promise<void> {
  const { createPublicApiAdminApi, publicApiChannelsQueryOptions, publicApiKeysQueryOptions } =
    await import("./public-api-admin-api.js")
  const api = createPublicApiAdminApi(runtime.baseUrl, runtime.fetcher ?? fetch)
  await Promise.all([
    queryClient.prefetchQuery(publicApiKeysQueryOptions(api)),
    queryClient.prefetchQuery(publicApiChannelsQueryOptions(api)),
  ])
}

async function loadCustomerAccounts({
  queryClient,
  runtime,
}: AdminRouteLoaderContext): Promise<void> {
  const {
    createCustomerAccountsAdminApi,
    customerAccountCapabilitiesQueryOptions,
    customerAccountCredentialsQueryOptions,
    customerAccountSettingsQueryOptions,
  } = await import("./public-api-admin-api.js")
  const api = createCustomerAccountsAdminApi(runtime.baseUrl, runtime.fetcher ?? fetch)
  await Promise.all([
    queryClient.prefetchQuery(customerAccountCapabilitiesQueryOptions(api)),
    queryClient.prefetchQuery(customerAccountSettingsQueryOptions(api)),
    queryClient.prefetchQuery(customerAccountCredentialsQueryOptions(api)),
  ])
}

async function loadCustomerBusinessAccounts({
  queryClient,
  runtime,
}: AdminRouteLoaderContext): Promise<void> {
  const {
    createCustomerBusinessAccountsAdminApi,
    customerBusinessAccountCapabilitiesQueryOptions,
    customerBusinessAccountRequestsQueryOptions,
  } = await import("./customer-business-accounts-admin-api.js")
  const api = createCustomerBusinessAccountsAdminApi(runtime.baseUrl, runtime.fetcher ?? fetch)
  const capabilities = await queryClient.fetchQuery(
    customerBusinessAccountCapabilitiesQueryOptions(api),
  )
  if (capabilities.viewRequests) {
    await queryClient.prefetchQuery(customerBusinessAccountRequestsQueryOptions(api))
  }
}

async function hasAdditionalTeamMember({ runtime }: AdminRouteLoaderContext): Promise<boolean> {
  const fetcher = runtime.fetcher ?? fetch
  const [membersResponse, invitationsResponse] = await Promise.all([
    fetcher(`${runtime.baseUrl}/v1/admin/team/members`),
    fetcher(`${runtime.baseUrl}/v1/admin/team/invitations`),
  ])
  if (!membersResponse.ok || !invitationsResponse.ok) return false
  const members = (await membersResponse.json()) as { data?: unknown[] }
  const invitations = (await invitationsResponse.json()) as { data?: unknown[] }
  return (members.data?.length ?? 0) > 1 || (invitations.data?.length ?? 0) > 0
}
