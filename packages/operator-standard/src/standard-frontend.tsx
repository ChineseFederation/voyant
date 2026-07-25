import { apiKeyClient } from "@better-auth/api-key/client"
import type { QueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"
import { createMiddleware, createServerFn } from "@tanstack/react-start"
import type { AdminAuthRuntime } from "@voyant-travel/admin/app"
import {
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
import { adminFetcher, getAdminApiUrl } from "@voyant-travel/admin-app/runtime"
import {
  type AdminHostPresentation,
  createAdminHostPresentation,
} from "@voyant-travel/admin-host/presentation"
import {
  type AdminHostWorkspace,
  createAdminHostWorkspace,
} from "@voyant-travel/admin-host/workspace"
import { createAuthBasePathFetcher } from "@voyant-travel/auth-react/client"
import type {
  LocalAuthPresentationRuntime,
  LocalAuthRouteContribution,
} from "@voyant-travel/auth-react/local-auth-routes"
import type { RedeemInvitationStatus } from "@voyant-travel/auth-react/ui"
import { RealtimeChannel } from "@voyant-travel/cloud-sdk"
import type { VoyantGraphJsonValue } from "@voyant-travel/core/project"
import { CruiseDetailPage } from "@voyant-travel/cruises-react/storefront"
import type {
  createFinancePublicRouteContribution,
  FinancePublicRouteRuntime,
} from "@voyant-travel/finance-react/public-routes"
import { ProductDetailPageProducts } from "@voyant-travel/inventory-react/storefront"
import { VoyantAvailabilityProvider } from "@voyant-travel/operations-react/availability/provider"
import type {
  createQuotesPublicRouteContribution,
  QuotesPublicRouteRuntime,
} from "@voyant-travel/quotes-react/public-routes"
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
    quotes?: ReturnType<typeof createQuotesPublicRouteContribution>["routes"]
    storefront?: StorefrontPresentationContribution["routes"]
  }
  createRouter<TRouteTree extends AnyRoute>(options: {
    routeTree: TRouteTree
    workspaceRoute: AnyRoute
  }): ReturnType<typeof createAdminRouter<TRouteTree>>
}

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

const adminAuthRuntime: AdminAuthRuntime<StandardOperatorCurrentUser> = {
  getCurrentUser,
  getBootstrapStatus,
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
  const financeFactory = presentationFactories["@voyant-travel/finance#presentation.public"] as
    | FinancePublicPresentationFactory
    | undefined
  const quotesFactory = presentationFactories["@voyant-travel/quotes#presentation.public"] as
    | QuotesPublicPresentationFactory
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
  const quotes = quotesFactory?.({
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
  })
  return { finance, localAuth, quotes, storefront, workspace }
}

export function createStandardOperatorFrontend(
  options: CreateStandardOperatorFrontendOptions,
): StandardOperatorFrontend {
  const presentation = createAdminHostPresentation(options)
  const runtime = createPresentationRuntime(presentation, options.presentations)
  const AvailabilityProvider: AdminChildProvider = ({ children }) => (
    <VoyantAvailabilityProvider baseUrl={getAdminApiUrl()} fetcher={adminFetcher}>
      {children}
    </VoyantAvailabilityProvider>
  )
  const providers = [TooltipProvider, AvailabilityProvider] satisfies readonly AdminChildProvider[]

  function Providers({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
    const baseUrl = getAdminApiUrl()
    // Admin Better Auth routes live under `/auth/admin/*` (the isolated admin
    // realm). auth-react hooks (useSignUp/useSignIn/useAuthStatus) target the
    // default `/auth/*` surface, so scope the shared admin fetcher to the admin
    // realm — mirroring the storefront's `/auth/customer` rewrite. Non-auth URLs
    // pass through unchanged, so domain data hooks are unaffected.
    const adminAuthFetcher = useMemo(
      () => createAuthBasePathFetcher(adminFetcher, { baseUrl, authBasePath: "/auth/admin" }),
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
      ...(runtime.quotes ? { quotes: runtime.quotes.routes } : {}),
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

type QuotesPublicPresentationFactory = (
  runtime: QuotesPublicRouteRuntime,
) => ReturnType<typeof createQuotesPublicRouteContribution>

function StandardStorefrontComposerPage(props: StorefrontComposerRouteProps) {
  return (
    <StorefrontComposerPage
      {...props}
      messages={useOperatorAdminMessages().trips.storefrontComposer}
    />
  )
}
