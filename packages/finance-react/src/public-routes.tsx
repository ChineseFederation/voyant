"use client"

import { Navigate, useParams, useSearch } from "@tanstack/react-router"
import { type ComponentType, lazy, type ReactNode, Suspense } from "react"
import { z } from "zod"
import type { PaymentLinkResolverMessages } from "./public-api/payment-link-resolver-page.js"
import type { PublicPaymentLinkPageMessages } from "./public-api/public-payment-link-page.js"

const AccountantPortal = lazy(() =>
  import("./components/accountant-portal.js").then((module) => ({
    default: module.AccountantPortal,
  })),
)
const PaymentLinkResolverPage = lazy(() =>
  import("./public-api/payment-link-resolver-page.js").then((module) => ({
    default: module.PaymentLinkResolverPage,
  })),
)
const PublicPaymentLinkPage = lazy(() =>
  import("./public-api/public-payment-link-page.js").then((module) => ({
    default: module.PublicPaymentLinkPage,
  })),
)

function PublicFinanceRouteFallback() {
  return <div className="min-h-screen bg-background" />
}

const paymentSearchSchema = z.object({
  orderID: z.string().optional(),
  orderId: z.string().optional(),
  sessionId: z.string().optional(),
})

export interface FinancePublicRouteRuntime {
  getApiUrl(): string
  PublicApiMessagesProvider: ComponentType<{ children: ReactNode }>
  usePaymentResolverMessages(): PaymentLinkResolverMessages
  usePaymentLinkMessages(): PublicPaymentLinkPageMessages
}

export function createFinancePublicRouteContribution(runtime: FinancePublicRouteRuntime) {
  function PayRoute() {
    return (
      <runtime.PublicApiMessagesProvider>
        <Suspense fallback={<PublicFinanceRouteFallback />}>
          <PayRouteContent />
        </Suspense>
      </runtime.PublicApiMessagesProvider>
    )
  }

  function PayRouteContent() {
    const { orderID, orderId, sessionId } = useSearch({ strict: false }) as z.infer<
      typeof paymentSearchSchema
    >
    return (
      <PaymentLinkResolverPage
        reference={orderID ?? orderId ?? sessionId ?? null}
        messages={runtime.usePaymentResolverMessages()}
        renderResolvedSession={(resolvedSessionId) => (
          <Navigate to="/pay/$sessionId" params={{ sessionId: resolvedSessionId }} replace />
        )}
      />
    )
  }

  function PaymentLinkRoute() {
    return (
      <runtime.PublicApiMessagesProvider>
        <Suspense fallback={<PublicFinanceRouteFallback />}>
          <PaymentLinkRouteContent />
        </Suspense>
      </runtime.PublicApiMessagesProvider>
    )
  }

  function PaymentLinkRouteContent() {
    const { sessionId } = useParams({ strict: false }) as { sessionId: string }
    return (
      <PublicPaymentLinkPage
        sessionId={sessionId}
        messages={runtime.usePaymentLinkMessages()}
        renderResolvedSession={(resolvedSessionId) => (
          <Navigate to="/pay/$sessionId" params={{ sessionId: resolvedSessionId }} replace />
        )}
      />
    )
  }

  function AccountantPortalRoute() {
    const { token } = useParams({ strict: false }) as { token: string }
    return (
      <div className="min-h-screen bg-background">
        <Suspense fallback={<PublicFinanceRouteFallback />}>
          <AccountantPortal token={token} apiBaseUrl={runtime.getApiUrl()} />
        </Suspense>
      </div>
    )
  }

  return {
    id: "@voyant-travel/finance#presentation.public" as const,
    routes: {
      pay: { validateSearch: paymentSearchSchema, component: PayRoute },
      paymentLink: { component: PaymentLinkRoute },
      accountant: { component: AccountantPortalRoute },
    },
  }
}
