"use client"

import { Outlet, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { type ComponentType, lazy, type ReactNode, Suspense } from "react"
import { z } from "zod"
import type { VoyantFetcher } from "../customer-portal/client.js"
import { getStorefrontCustomerProductDetailRoute } from "../routing.js"
import type { StorefrontConfirmationKind } from "./confirmation-page.js"
import { type StorefrontUiNavigation, StorefrontUiProvider } from "./context.js"
import { CustomerAccountProvider } from "./customer-account-provider.js"
import { useCustomerAuthConfig } from "./customer-auth-config.js"
import type { CustomerSocialAuthProvider } from "./customer-auth-pages.js"
import {
  type StorefrontMessages,
  StorefrontMessagesProvider,
  useStorefrontMessagesOrDefault,
} from "./messages.js"
import { StorefrontScopeProvider, useStorefrontScope } from "./scope.js"
import { StorefrontShell } from "./shell.js"
import { shopSearchSchema } from "./shop-search.js"

const StorefrontBrowsePage = lazy(() =>
  import("./browse-page.js").then((module) => ({ default: module.StorefrontBrowsePage })),
)
const StorefrontConfirmationPage = lazy(() =>
  import("./confirmation-page.js").then((module) => ({
    default: module.StorefrontConfirmationPage,
  })),
)
const CustomerAccountPage = lazy(() =>
  import("./customer-account-page.js").then((module) => ({
    default: module.CustomerAccountPage,
  })),
)
const CustomerSignInPage = lazy(() =>
  import("./customer-auth-pages.js").then((module) => ({ default: module.CustomerSignInPage })),
)
const CustomerSignUpPage = lazy(() =>
  import("./customer-auth-pages.js").then((module) => ({ default: module.CustomerSignUpPage })),
)
const CustomerVerifyEmailPage = lazy(() =>
  import("./customer-auth-pages.js").then((module) => ({
    default: module.CustomerVerifyEmailPage,
  })),
)

function StorefrontRouteFallback() {
  return <div className="min-h-48" />
}

const accountSignInSearchSchema = z.object({
  next: z.string().optional(),
  verify: z.string().optional(),
})

const accountSignUpSearchSchema = z.object({
  next: z.string().optional(),
})

const accountVerifyEmailSearchSchema = z.object({
  email: z.string().optional(),
  next: z.string().optional(),
})

const confirmationSearchSchema = z.object({
  kind: z.enum(["card_pending", "bank_transfer", "inquiry", "hold"]).optional(),
  session: z.string().optional(),
  orderId: z.string().optional(),
  ref: z.string().optional(),
})

export interface StorefrontPresentationSession {
  readonly data: unknown
  readonly isPending: boolean
}

export interface StorefrontComposerRouteProps {
  apiUrl: string
  gateMessages: StorefrontMessages["composer"]
  signedIn: boolean
}

export interface StorefrontPresentationRuntime {
  readonly ComposerPage: ComponentType<StorefrontComposerRouteProps>
  getApiUrl(): string
  projectFetcher: VoyantFetcher
  renderProductDetail(entityModule: string, entityId: string): ReactNode
  requestEmailCode(email: string): Promise<unknown>
  resendVerification(email: string): Promise<unknown>
  signInWithEmailCode(input: { email: string; code: string }): Promise<unknown>
  signInWithSocial(provider: CustomerSocialAuthProvider, callbackURL: string): Promise<unknown>
  signOut(): Promise<unknown>
  useLocale(): string
  useSession(): StorefrontPresentationSession
}

export interface StorefrontPresentationRouteOptions {
  readonly component: () => ReactNode
  readonly beforeLoad?: (input: { params: { entityModule: string; entityId: string } }) => void
  readonly validateSearch?: z.ZodType
}

export interface StorefrontPresentationContribution {
  readonly id: "@voyant-travel/storefront#presentation.customer"
  readonly routes: {
    readonly layout: StorefrontPresentationRouteOptions
    readonly shop: StorefrontPresentationRouteOptions
    readonly account: StorefrontPresentationRouteOptions
    readonly accountSignIn: StorefrontPresentationRouteOptions
    readonly accountSignUp: StorefrontPresentationRouteOptions
    readonly accountVerifyEmail: StorefrontPresentationRouteOptions
    readonly composer: StorefrontPresentationRouteOptions
    readonly confirmation: StorefrontPresentationRouteOptions
    readonly productDetail: StorefrontPresentationRouteOptions
  }
}

/** Package-owned customer presentation selected with the Storefront graph unit. */
export function createStorefrontPresentationContribution(
  runtime: StorefrontPresentationRuntime,
): StorefrontPresentationContribution {
  function LayoutRoute(): React.ReactElement {
    return (
      <StorefrontMessagesProvider locale={runtime.useLocale()}>
        <StorefrontScopeProvider>
          <CustomerAccountProvider baseUrl={runtime.getApiUrl()} fetcher={runtime.projectFetcher}>
            <StorefrontChrome />
          </CustomerAccountProvider>
        </StorefrontScopeProvider>
      </StorefrontMessagesProvider>
    )
  }

  function StorefrontChrome(): React.ReactElement {
    const { data: session, isPending } = runtime.useSession()
    return (
      <StorefrontShell signedIn={Boolean(session)} sessionPending={isPending}>
        <Outlet />
      </StorefrontShell>
    )
  }

  function ShopRoute(): React.ReactElement {
    const messages = useStorefrontMessagesOrDefault()
    const scope = useStorefrontScope()
    const navigate = useNavigate()
    const search = useSearch({ strict: false }) as z.infer<typeof shopSearchSchema>
    return (
      <StorefrontUiProvider
        value={{
          apiUrl: runtime.getApiUrl(),
          messages,
          scope,
          navigate: (navigation: StorefrontUiNavigation) => void navigate(navigation as never),
        }}
      >
        <Suspense fallback={<StorefrontRouteFallback />}>
          <StorefrontBrowsePage search={search} />
        </Suspense>
      </StorefrontUiProvider>
    )
  }

  function AccountSignInRoute(): React.ReactElement | null {
    const navigate = useNavigate()
    const { next, verify } = useSearch({ strict: false }) as z.infer<
      typeof accountSignInSearchSchema
    >
    const { data: session, isPending } = runtime.useSession()
    const authConfig = useCustomerAuthConfig()
    const redirectTo = next || "/shop/account"
    if (isPending || authConfig.isPending) return null
    if (session) {
      void navigate({ to: redirectTo })
      return null
    }
    if (authConfig.error || !authConfig.config) return <CustomerAuthUnavailable />
    return (
      <Suspense fallback={<StorefrontRouteFallback />}>
        <CustomerSignInPage
          methods={authConfig.config.methods}
          redirectTo={redirectTo}
          verified={Boolean(verify)}
          requestEmailCode={runtime.requestEmailCode}
          signInWithEmailCode={runtime.signInWithEmailCode}
          signInWithSocial={runtime.signInWithSocial}
          onNavigate={(to) => void navigate({ to })}
        />
      </Suspense>
    )
  }

  function AccountSignUpRoute(): React.ReactElement | null {
    const navigate = useNavigate()
    const { next } = useSearch({ strict: false }) as z.infer<typeof accountSignUpSearchSchema>
    const { data: session, isPending } = runtime.useSession()
    const authConfig = useCustomerAuthConfig()
    const redirectTo = next || "/shop/account"
    if (isPending || authConfig.isPending) return null
    if (session) {
      void navigate({ to: redirectTo })
      return null
    }
    if (authConfig.error || !authConfig.config) return <CustomerAuthUnavailable />
    if (!authConfig.config.methods.emailPassword) {
      void navigate({ to: "/shop/account/sign-in", search: { next: redirectTo } })
      return null
    }
    return (
      <Suspense fallback={<StorefrontRouteFallback />}>
        <CustomerSignUpPage
          methods={authConfig.config.methods}
          redirectTo={redirectTo}
          signInWithSocial={runtime.signInWithSocial}
          onNavigateToVerify={(email) =>
            void navigate({
              to: "/shop/account/verify-email",
              search: { email, next: redirectTo },
            })
          }
        />
      </Suspense>
    )
  }

  function CustomerAuthUnavailable(): React.ReactElement {
    return (
      <div className="mx-auto max-w-md py-10">
        <Card>
          <CardHeader>
            <CardTitle>Sign-in unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            Customer authentication is not configured for this storefront. Try again later.
          </CardContent>
        </Card>
      </div>
    )
  }

  function AccountRoute(): React.ReactElement | null {
    const navigate = useNavigate()
    const { data: session, isPending } = runtime.useSession()
    if (isPending) return null
    if (!session) {
      void navigate({ to: "/shop/account/sign-in", search: { next: "/shop/account" } })
      return null
    }
    return (
      <Suspense fallback={<StorefrontRouteFallback />}>
        <CustomerAccountPage
          onSignOut={async () => {
            await runtime.signOut()
            void navigate({ to: "/shop" })
          }}
        />
      </Suspense>
    )
  }

  function AccountVerifyEmailRoute(): React.ReactElement {
    const navigate = useNavigate()
    const { email, next } = useSearch({ strict: false }) as z.infer<
      typeof accountVerifyEmailSearchSchema
    >
    const redirectTo = next || "/shop/account"
    return (
      <Suspense fallback={<StorefrontRouteFallback />}>
        <CustomerVerifyEmailPage
          email={email}
          redirectTo={redirectTo}
          onCompleted={async () => {
            await runtime.signOut()
          }}
          onResendVerification={async (verificationEmail) => {
            await runtime.resendVerification(verificationEmail)
          }}
          onNavigateToSignIn={() =>
            void navigate({
              to: "/shop/account/sign-in",
              search: { next: redirectTo, verify: "1" },
            })
          }
        />
      </Suspense>
    )
  }

  function ComposerRoute(): React.ReactElement | null {
    const { data: session, isPending } = runtime.useSession()
    const messages = useStorefrontMessagesOrDefault()
    if (isPending) return null
    return (
      <runtime.ComposerPage
        apiUrl={runtime.getApiUrl()}
        gateMessages={messages.composer}
        signedIn={Boolean(session)}
      />
    )
  }

  function ConfirmationRoute(): React.ReactElement {
    const { bookingId } = useParams({ strict: false }) as { bookingId: string }
    const search = useSearch({ strict: false }) as z.infer<typeof confirmationSearchSchema>
    return (
      <Suspense fallback={<StorefrontRouteFallback />}>
        <StorefrontConfirmationPage
          apiUrl={runtime.getApiUrl()}
          bookingId={bookingId}
          kind={search.kind as StorefrontConfirmationKind | undefined}
          paymentRef={search.session ?? search.orderId ?? search.ref}
        />
      </Suspense>
    )
  }

  function ProductDetailRoute(): React.ReactElement {
    const { entityModule, entityId } = useParams({ strict: false }) as {
      entityModule: string
      entityId: string
    }
    const messages = useStorefrontMessagesOrDefault()
    const scope = useStorefrontScope()
    const navigate = useNavigate()
    const t = messages.shop
    if (!getStorefrontCustomerProductDetailRoute(entityModule, entityId)) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{t.nonBookableTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {t.nonBookableBody.replace("{vertical}", formatVerticalLabel(entityModule, t))}
          </CardContent>
        </Card>
      )
    }
    return (
      <StorefrontUiProvider
        value={{
          apiUrl: runtime.getApiUrl(),
          messages,
          scope,
          navigate: (navigation: StorefrontUiNavigation) => void navigate(navigation as never),
        }}
      >
        {runtime.renderProductDetail(entityModule, entityId)}
      </StorefrontUiProvider>
    )
  }

  return {
    id: "@voyant-travel/storefront#presentation.customer",
    routes: {
      layout: { component: LayoutRoute },
      shop: { component: ShopRoute, validateSearch: shopSearchSchema },
      account: { component: AccountRoute },
      accountSignIn: {
        component: AccountSignInRoute,
        validateSearch: accountSignInSearchSchema,
      },
      accountSignUp: {
        component: AccountSignUpRoute,
        validateSearch: accountSignUpSearchSchema,
      },
      accountVerifyEmail: {
        component: AccountVerifyEmailRoute,
        validateSearch: accountVerifyEmailSearchSchema,
      },
      composer: { component: ComposerRoute },
      confirmation: {
        component: ConfirmationRoute,
        validateSearch: confirmationSearchSchema,
      },
      productDetail: { component: ProductDetailRoute },
    },
  }
}

export function createStorefrontMessagesProvider(useLocale: () => string) {
  return function SelectedStorefrontMessagesProvider({ children }: { children: ReactNode }) {
    return <StorefrontMessagesProvider locale={useLocale()}>{children}</StorefrontMessagesProvider>
  }
}

function formatVerticalLabel(vertical: string, messages: StorefrontMessages["shop"]): string {
  if (vertical === "products") return messages.verticalProducts
  if (vertical === "cruises") return messages.verticalCruises
  if (vertical === "accommodations") return messages.verticalAccommodations
  if (vertical === "charters") return messages.verticalCharters
  return vertical
}
