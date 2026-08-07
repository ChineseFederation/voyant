import { apiKeyClient } from "@better-auth/api-key/client"
import type { QueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"
import { createMiddleware, createServerFn } from "@tanstack/react-start"
import type { AdminAuthRuntime } from "@voyant-travel/admin/app"
import {
  ADMIN_ACTIVE_MODULES_QUERY_KEY,
  type AdminRouterContext,
  attachAdminExtensionRoutes,
  buildAdminExtensionRoutes,
  createAdminRouter,
} from "@voyant-travel/admin/app"
import { useLocale } from "@voyant-travel/admin/providers/locale"
import { useOperatorAdminMessages } from "@voyant-travel/admin/providers/operator-admin-messages"
import {
  type AdminChildProvider,
  OperatorAdminShellProvider,
} from "@voyant-travel/admin/providers/operator-admin-shell"
import { UI_EXTENSIONS_QUERY_KEY } from "@voyant-travel/admin/ui-extensions"
import { adminFetcher, getAdminApiUrl } from "@voyant-travel/admin-app/runtime"
import {
  type AdminHostPresentation,
  createAdminHostPresentation,
} from "@voyant-travel/admin-host/presentation"
import {
  type AdminHostWorkspace,
  createAdminHostWorkspace,
} from "@voyant-travel/admin-host/workspace"
import type { OperatorShellBootstrap } from "@voyant-travel/auth/node-runtime"
import { createAuthBasePathFetcher } from "@voyant-travel/auth-react/client"
import type {
  LocalAuthPresentationRuntime,
  LocalAuthRouteContribution,
} from "@voyant-travel/auth-react/local-auth-routes"
import type { McpConsentRouteContribution } from "@voyant-travel/auth-react/mcp-consent-routes"
import type { RedeemInvitationStatus } from "@voyant-travel/auth-react/ui"
import { RealtimeChannel } from "@voyant-travel/cloud-sdk"
import type { VoyantGraphJsonValue } from "@voyant-travel/core/project"
import { CruiseDetailPage } from "@voyant-travel/cruises-react/storefront"
import type {
  createFinancePublicRouteContribution,
  FinancePublicRouteRuntime,
} from "@voyant-travel/finance-react/public-routes"
import { ProductDetailPageProducts } from "@voyant-travel/inventory-react/storefront"
import { navigationPreferencesQueryKey } from "@voyant-travel/navigation-preferences-react"
import type {
  createProposalsPublicRouteContribution,
  ProposalsPublicRouteRuntime,
} from "@voyant-travel/proposals-react/public-routes"
import { AdminWorkspaceRealtimeProvider } from "@voyant-travel/realtime-react"
import {
  AccommodationDetailPage,
  createStorefrontMessagesProvider,
  type StorefrontComposerRouteProps,
  type StorefrontPresentationContribution,
  type StorefrontPresentationRuntime,
  useStorefrontMessages,
} from "@voyant-travel/storefront-react/storefront"
import { StorefrontComposerPage } from "@voyant-travel/trips-react/storefront"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import { ConfirmDialogHost, PromptDialogHost } from "@voyant-travel/ui/components"
import { TooltipProvider } from "@voyant-travel/ui/components/tooltip"
import { emailOTPClient, organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { ComponentType, ReactNode } from "react"
import { useMemo } from "react"
import { createApiDocsRouteOptions, type OpenApiSpecLoaders } from "./standard-api-docs.js"

export {
  AdminRootErrorBoundary,
  AdminRootShell,
  adminRootHead,
} from "@voyant-travel/admin/app/root"
export { Toaster } from "@voyant-travel/ui/components"

export interface StandardOperatorCurrentUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  locale: string
  timezone: string | null
  uiPrefs: Record<string, VoyantGraphJsonValue> | null
  isSuperAdmin: boolean
  isSupportUser: boolean
  createdAt: string
  profilePictureUrl?: string | null
}

type StandardOperatorShellBootstrap = Omit<
  OperatorShellBootstrap,
  "user" | "navigationPreferences" | "extensions"
> & {
  user: StandardOperatorCurrentUser
  navigationPreferences: VoyantGraphJsonValue
  extensions: readonly Readonly<Record<string, VoyantGraphJsonValue>>[]
}

export interface CreateStandardOperatorFrontendOptions {
  accessCatalog: AccessCatalog
  selected: Parameters<typeof createAdminHostPresentation>[0]["selected"]
  presentations: Readonly<Record<string, StandardOperatorPresentationFactory>>
  project?: Record<string, unknown>
  openApiSpecs?: OpenApiSpecLoaders
}

export type StandardOperatorPresentationFactory = (...args: never[]) => unknown

export interface StandardOperatorFrontend {
  Providers: ComponentType<{ children: ReactNode; queryClient: QueryClient }>
  presentation: AdminHostPresentation
  workspace: AdminHostWorkspace<StandardOperatorCurrentUser>
  routes: {
    docs: ReturnType<typeof createApiDocsRouteOptions>
    finance?: ReturnType<typeof createFinancePublicRouteContribution>["routes"]
    localAuth?: LocalAuthRouteContribution["routes"]
    mcpConsent?: McpConsentRouteContribution["routes"]
    proposals?: ReturnType<typeof createProposalsPublicRouteContribution>["routes"]
    storefront?: StorefrontPresentationContribution["routes"]
  }
  createRouter<TRouteTree extends AnyRoute>(options: {
    routeTree: TRouteTree
    workspaceRoute: AnyRoute
  }): ReturnType<typeof createAdminRouter<TRouteTree>>
}

/**
 * Admin auth paths the deployment serves itself instead of handing to the admin
 * realm's Better Auth handler. Unlike the customer realm — which mounts its own
 * facades under `/auth/customer/*` — these stay on the shared `/auth/*` prefix,
 * so the realm rewrite below must leave them alone or they 404.
 *
 * Mounted by `createOperatorAuthNodeRuntime` in `@voyant-travel/auth`.
 */
const ADMIN_SHARED_AUTH_PATHS = [
  "/me",
  "/status",
  "/bootstrap-status",
  "/shell-bootstrap",
  "/api-tokens",
  "/organization/list-members",
] as const

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

const authClient = createAuthClient({
  baseURL: `${getAdminApiUrl()}/auth/admin`,
  plugins: [apiKeyClient(), organizationClient(), emailOTPClient()],
  fetchOptions: { credentials: "include" },
})

// Storefront customers are a distinct Better Auth realm. Never reuse the
// operator client here: its cookies, session storage, and provider policy belong
// exclusively to staff/admin identity.
const customerAuthClient = createAuthClient({
  baseURL: `${getAdminApiUrl()}/auth/customer`,
  plugins: [emailOTPClient()],
  fetchOptions: { credentials: "include" },
})

function cloudAuthStartHref(next?: string): string {
  const params = new URLSearchParams()
  if (next) params.set("next", next)
  const query = params.toString()
  return `/api/auth/admin/cloud/start${query ? `?${query}` : ""}`
}

function shouldUseBrowserEvidenceFallback(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  const isLocal = hostname === "127.0.0.1" || hostname === "localhost"
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env
  return processEnv?.VOYANT_OPERATOR_BROWSER_EVIDENCE === "1" && isLocal
}

const withRequest = createMiddleware({ type: "request" }).server(({ next, request }) =>
  next({ context: { request } }),
)

const getBootstrapStatus = createServerFn({ method: "GET" })
  .middleware([withRequest])
  .handler(async ({ context }) => {
    if (shouldUseBrowserEvidenceFallback(context.request)) return { hasUsers: true }
    const response = await fetch(new URL("/api/auth/bootstrap-status", context.request.url))
    if (!response.ok) throw new Error("Failed to fetch bootstrap status")
    return (await response.json()) as {
      hasUsers: boolean
      authMode?: "local" | "voyant-cloud"
    }
  })

const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([withRequest])
  .handler(async ({ context }) => {
    if (shouldUseBrowserEvidenceFallback(context.request)) return null
    const headers = new Headers()
    const cookie = context.request.headers.get("cookie")
    if (cookie) headers.set("cookie", cookie)
    const response = await fetch(new URL("/api/auth/me", context.request.url), { headers })
    if (response.status === 401) return null
    if (!response.ok) throw new Error("Failed to fetch current user")
    return (await response.json()) as StandardOperatorCurrentUser
  })

const getShellBootstrap = createServerFn({ method: "GET" })
  .middleware([withRequest])
  .handler(async ({ context }) => {
    if (shouldUseBrowserEvidenceFallback(context.request)) return null
    const headers = new Headers()
    const cookie = context.request.headers.get("cookie")
    const authorization = context.request.headers.get("authorization")
    if (cookie) headers.set("cookie", cookie)
    if (authorization) headers.set("authorization", authorization)
    const response = await fetch(new URL("/api/auth/shell-bootstrap", context.request.url), {
      headers,
      cache: "no-store",
    })
    if (response.status === 401) return null
    if (!response.ok) throw new Error("Failed to fetch admin shell bootstrap")
    const bootstrap = (await response.json()) as StandardOperatorShellBootstrap
    if (bootstrap.version !== 1 || bootstrap.compatibility.minimumShellVersion > 1) {
      throw new Error(
        `Incompatible admin shell bootstrap contract (received ${bootstrap.version}, shell supports 1)`,
      )
    }
    return bootstrap
  })

async function fetchBrowserApi<T>(path: string): Promise<T | null> {
  const response = await fetch(`/api${path}`, { credentials: "include", cache: "no-store" })
  if (response.status === 401) return null
  if (!response.ok) throw new Error(`Failed to fetch ${path}`)
  return response.json() as Promise<T>
}

const getBrowserBootstrapStatus = async () => {
  const status = await fetchBrowserApi<{ hasUsers: boolean; authMode?: "local" | "voyant-cloud" }>(
    "/auth/bootstrap-status",
  )
  if (!status) throw new Error("Failed to fetch bootstrap status")
  return status
}

const getBrowserCurrentUser = () => fetchBrowserApi<StandardOperatorCurrentUser>("/auth/me")

const getBrowserShellBootstrap = async () => {
  const bootstrap = await fetchBrowserApi<StandardOperatorShellBootstrap>("/auth/shell-bootstrap")
  if (bootstrap && (bootstrap.version !== 1 || bootstrap.compatibility.minimumShellVersion > 1)) {
    throw new Error(
      `Incompatible admin shell bootstrap contract (received ${bootstrap.version}, shell supports 1)`,
    )
  }
  return bootstrap
}

const isPortableBrowser =
  typeof document !== "undefined" && document.documentElement.dataset.voyantPortableShell === "1"

const adminAuthRuntime: AdminAuthRuntime<StandardOperatorCurrentUser> = {
  getCurrentUser: isPortableBrowser ? getBrowserCurrentUser : getCurrentUser,
  getShellBootstrap: isPortableBrowser ? getBrowserShellBootstrap : getShellBootstrap,
  getBootstrapStatus: isPortableBrowser ? getBrowserBootstrapStatus : getBootstrapStatus,
  cloudAuthStartHref,
  signOut: async () => {
    await authClient.signOut()
  },
  updateCurrentUserPreferences: (preferences) =>
    apiCall<StandardOperatorCurrentUser>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(preferences),
    }),
}

async function apiCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  const response = await adminFetcher(`${getAdminApiUrl()}${path}`, {
    ...options,
    headers,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => undefined)
    const detail = body as { error?: string | { message?: string } } | undefined
    const message =
      typeof detail?.error === "string"
        ? detail.error
        : (detail?.error?.message ?? `API error: ${response.status} ${response.statusText}`)
    throw new ApiError(message, response.status, body)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const useStorefrontLocale = () => useLocale().resolvedLocale

function createPresentationRuntime(
  presentation: AdminHostPresentation,
  presentationFactories: Readonly<Record<string, StandardOperatorPresentationFactory>>,
) {
  const StorefrontMessagesProvider = createStorefrontMessagesProvider(useStorefrontLocale)
  const localAuthFactory = presentationFactories["@voyant-travel/auth#presentation.local-auth"] as
    | LocalAuthPresentationFactory
    | undefined
  // The consent screen needs no host runtime: it reads the signed query from the
  // address bar and posts it back through the shared React context.
  const mcpConsentFactory = presentationFactories["@voyant-travel/mcp#presentation.consent"] as
    | (() => McpConsentRouteContribution)
    | undefined
  const financeFactory = presentationFactories["@voyant-travel/finance#presentation.public"] as
    | FinancePublicPresentationFactory
    | undefined
  const proposalsFactory = presentationFactories["@voyant-travel/proposals#presentation.public"] as
    | ProposalsPublicPresentationFactory
    | undefined
  const storefrontFactory = presentationFactories[
    "@voyant-travel/storefront#presentation.customer"
  ] as ((runtime: StorefrontPresentationRuntime) => StorefrontPresentationContribution) | undefined
  const storefront = storefrontFactory?.({
    ComposerPage: StandardStorefrontComposerPage,
    getApiUrl: getAdminApiUrl,
    projectFetcher: adminFetcher,
    renderProductDetail: (entityModule, entityId) => {
      if (entityModule === "accommodations") return <AccommodationDetailPage entityId={entityId} />
      if (entityModule === "cruises") return <CruiseDetailPage entityId={entityId} />
      return <ProductDetailPageProducts entityModule={entityModule} entityId={entityId} />
    },
    requestEmailCode: async (email) => {
      const result = await customerAuthClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      })
      if (result.error) throw new Error(result.error.message ?? "Could not send sign-in code.")
      return result.data
    },
    resendVerification: async (email) => {
      const result = await customerAuthClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      })
      if (result.error) throw new Error(result.error.message ?? "Could not send verification code.")
      return result.data
    },
    signInWithEmailCode: async ({ email, code }) => {
      const result = await customerAuthClient.signIn.emailOtp({ email, otp: code })
      if (result.error) throw new Error(result.error.message ?? "Could not sign in with that code.")
      return result.data
    },
    signInWithSocial: async (provider, callbackURL) => {
      const result = await customerAuthClient.signIn.social({ provider, callbackURL })
      if (result.error) throw new Error(result.error.message ?? "Could not start social sign-in.")
      return result.data
    },
    signOut: async () => {
      const result = await customerAuthClient.signOut()
      if (result.error) throw new Error(result.error.message ?? "Could not sign out.")
      return result.data
    },
    useLocale: useStorefrontLocale,
    useSession: () => customerAuthClient.useSession(),
  })
  const finance = financeFactory?.({
    getApiUrl: getAdminApiUrl,
    StorefrontMessagesProvider,
    usePaymentResolverMessages: () => useStorefrontMessages().pay,
    usePaymentLinkMessages: () => ({
      ...useStorefrontMessages().pay,
      bookingSummary: useOperatorAdminMessages().bookings.detail.paymentLinkSummary,
      tripSummary: useOperatorAdminMessages().trips.paymentLinkSummary,
    }),
  })
  const proposals = proposalsFactory?.({
    getApiUrl: getAdminApiUrl,
    StorefrontMessagesProvider,
    useProposalMessages: () => useStorefrontMessages().proposal,
  })
  const localAuth = localAuthFactory?.({
    getCurrentUser,
    getBootstrapStatus,
    cloudAuthStartHref,
    useMessages: () => useOperatorAdminMessages().auth,
    getInvitation: (token) =>
      apiCall<RedeemInvitationStatus>(`/v1/public/invitations/${encodeURIComponent(token)}`),
    redeemInvitation: async (token, input) => {
      await apiCall(`/v1/public/invitations/${encodeURIComponent(token)}/redeem`, {
        method: "POST",
        body: JSON.stringify(input),
      })
    },
    signInWithEmail: (input) => authClient.signIn.email(input),
    signUpWithEmail: (input) => authClient.signUp.email(input),
    signInWithSocial: (provider, callbackURL) =>
      authClient.signIn.social({ provider, callbackURL }),
    sendVerificationOtp: (email) =>
      authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" }),
    refreshAuthStatus: () => fetch(`${getAdminApiUrl()}/auth/status`, { credentials: "include" }),
  })
  const workspace = createAdminHostWorkspace({
    auth: adminAuthRuntime,
    presentation,
    api: { getBaseUrl: getAdminApiUrl, fetcher: adminFetcher },
    realtime: {
      Provider: AdminWorkspaceRealtimeProvider,
      channel: RealtimeChannel,
      useSession: authClient.useSession,
    },
    hydrateShellBootstrap: (bootstrap, queryClient) => {
      const capabilities = new Set(bootstrap.compatibility.capabilities)
      if (capabilities.has("admin.shell-bootstrap.navigation-preferences")) {
        queryClient.setQueryData(
          navigationPreferencesQueryKey(bootstrap.user.id),
          bootstrap.navigationPreferences,
        )
      }
      if (capabilities.has("admin.shell-bootstrap.extensions")) {
        queryClient.setQueryData(UI_EXTENSIONS_QUERY_KEY, bootstrap.extensions)
      }
      queryClient.setQueryDefaults(["voyant", "admin", "entitlements"], {
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: true,
        refetchInterval: false,
      })
      if (capabilities.has("admin.shell-bootstrap.entitlements")) {
        queryClient.setQueryData(["voyant", "admin", "entitlements"], bootstrap.entitlements)
      }
      queryClient.setQueryData(ADMIN_ACTIVE_MODULES_QUERY_KEY, bootstrap.activeModules)
    },
  })
  const mcpConsent = mcpConsentFactory?.()
  return { finance, localAuth, mcpConsent, proposals, storefront, workspace }
}

export function createStandardOperatorFrontend(
  options: CreateStandardOperatorFrontendOptions,
): StandardOperatorFrontend {
  const presentation = createAdminHostPresentation(options)
  const runtime = createPresentationRuntime(presentation, options.presentations)
  // Every `Voyant<Domain>Provider` is an alias of the one `VoyantReactProvider`,
  // so they all write the same React context. Re-rendering one below the shell
  // would replace the shell's `{ baseUrl, fetcher }` for the entire tree — the
  // admin realm scoping below included. Domain hooks read the shell's context
  // directly, so nothing here re-provides it.
  const providers = [TooltipProvider] satisfies readonly AdminChildProvider[]

  function Providers({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
    const baseUrl = getAdminApiUrl()
    // Admin Better Auth routes live under `/auth/admin/*` (the isolated admin
    // realm). auth-react hooks (useSignUp/useSignIn/useAuthStatus) target the
    // default `/auth/*` surface, so scope the shared admin fetcher to the admin
    // realm — mirroring the storefront's `/auth/customer` rewrite. Non-auth URLs
    // pass through unchanged, so domain data hooks are unaffected.
    const adminAuthFetcher = useMemo(
      () =>
        createAuthBasePathFetcher(adminFetcher, {
          baseUrl,
          authBasePath: "/auth/admin",
          sharedPaths: ADMIN_SHARED_AUTH_PATHS,
        }),
      [baseUrl],
    )
    return (
      <OperatorAdminShellProvider
        baseUrl={baseUrl}
        fetcher={adminAuthFetcher}
        queryClient={queryClient}
        providers={providers}
      >
        {children}
        <ConfirmDialogHost />
        <PromptDialogHost />
      </OperatorAdminShellProvider>
    )
  }

  return {
    Providers,
    presentation,
    workspace: runtime.workspace,
    routes: {
      docs: createApiDocsRouteOptions(options.openApiSpecs ?? {}),
      ...(runtime.finance ? { finance: runtime.finance.routes } : {}),
      ...(runtime.localAuth ? { localAuth: runtime.localAuth.routes } : {}),
      ...(runtime.mcpConsent ? { mcpConsent: runtime.mcpConsent.routes } : {}),
      ...(runtime.proposals ? { proposals: runtime.proposals.routes } : {}),
      ...(runtime.storefront ? { storefront: runtime.storefront.routes } : {}),
    },
    createRouter<TRouteTree extends AnyRoute>({
      routeTree,
      workspaceRoute,
    }: {
      routeTree: TRouteTree
      workspaceRoute: AnyRoute
    }) {
      const adminRoutes = buildAdminExtensionRoutes(
        presentation.extensions,
        () => workspaceRoute,
        () => ({ baseUrl: getAdminApiUrl(), fetcher: adminFetcher }),
      )
      return createAdminRouter({
        routeTree: attachAdminExtensionRoutes(routeTree, workspaceRoute, adminRoutes),
      })
    },
  }
}

export type StandardOperatorRouterContext = AdminRouterContext

type LocalAuthPresentationFactory = (
  runtime: LocalAuthPresentationRuntime<StandardOperatorCurrentUser>,
) => LocalAuthRouteContribution

type FinancePublicPresentationFactory = (
  runtime: FinancePublicRouteRuntime,
) => ReturnType<typeof createFinancePublicRouteContribution>

type ProposalsPublicPresentationFactory = (
  runtime: ProposalsPublicRouteRuntime,
) => ReturnType<typeof createProposalsPublicRouteContribution>

function StandardStorefrontComposerPage(props: StorefrontComposerRouteProps) {
  return (
    <StorefrontComposerPage
      {...props}
      messages={useOperatorAdminMessages().trips.storefrontComposer}
    />
  )
}
