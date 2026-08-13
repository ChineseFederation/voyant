"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import type { ReactNode } from "react"

import { type BankTransferInstructions, PaymentLinkLandingPage } from "../checkout-ui.js"
import { usePublicPaymentSession } from "../hooks/use-public-payment-session.js"
import { useVoyantFinanceContext } from "../provider.js"
import {
  type PaymentLinkBookingSummaryMessages,
  usePaymentLinkBookingSummary,
} from "./payment-link-booking-summary.js"
import {
  type PaymentLinkTripSummaryMessages,
  usePaymentLinkTripSummary,
} from "./payment-link-trip-summary.js"

/**
 * Public payment-link landing page. The customer arrives here from a link
 * sent by `@voyant-travel/notifications` after the operator initiates a checkout
 * with `paymentChoice=send_link`. No auth required — the session id
 * (TypeID) is the bearer; ownership is implicit by knowing the URL.
 *
 * The route lives at the root (sibling of `_workspace` and `(auth)`) so it
 * doesn't inherit the workspace shell or sign-in layout.
 *
 * See `docs/architecture/payments-architecture.md` §Core Rule 4.
 */
interface PaymentLinkConfigResponse {
  data: {
    bankTransfer: {
      provider?: string | null
      beneficiary: string
      iban: string
      bankName?: string | null
      currency?: string | null
      notes?: string | null
    } | null
    /**
     * Absent on deployments running an older payment-link route module —
     * treated as available, which is what those deployments did before the
     * field existed.
     */
    cardPayments?: { available: boolean } | null
  }
}

export interface PublicPaymentLinkPageMessages {
  notFoundTitle: string
  notFoundBody: string
  retryFailed: string
  bookingSummary: PaymentLinkBookingSummaryMessages
  tripSummary: PaymentLinkTripSummaryMessages
}

export interface PublicPaymentLinkPageProps {
  sessionId: string
  messages: PublicPaymentLinkPageMessages
  renderResolvedSession: (sessionId: string) => ReactNode
  onRetrySession?: (sessionId: string) => void
}

export function PublicPaymentLinkPage({
  sessionId,
  messages: t,
  renderResolvedSession,
  onRetrySession = (nextSessionId) => {
    window.location.href = `/pay/${nextSessionId}`
  },
}: PublicPaymentLinkPageProps) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const sessionQuery = usePublicPaymentSession(sessionId)
  const tripSummary = usePaymentLinkTripSummary(sessionId, t.tripSummary)
  const bookingSummary = usePaymentLinkBookingSummary(sessionId, t.bookingSummary)
  const configQuery = useQuery({
    queryKey: ["payment-link-config"],
    queryFn: async (): Promise<PaymentLinkConfigResponse["data"]> => {
      const res = await fetcher(`${baseUrl}/v1/public/payment-link-config`, {
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`config fetch failed: ${res.status}`)
      const body = (await res.json()) as PaymentLinkConfigResponse
      return body.data
    },
    staleTime: 5 * 60 * 1000,
  })

  // Pay-by-link processors (Netopia, etc.) sometimes append the orderID
  // they were given as a *path* segment (`/pay/<orderID>`), not a query
  // param. The orderID can be a clientReference or externalReference, not
  // necessarily the canonical session id. Fall back to the resolver
  // endpoint so any of those keys land the customer on the right session.
  const sessionMissing = !sessionQuery.isLoading && !sessionQuery.data?.data
  const resolveQuery = useQuery({
    queryKey: ["payment-link-resolve", sessionId],
    enabled: sessionMissing,
    retry: false,
    queryFn: async (): Promise<{ sessionId: string }> => {
      const res = await fetcher(
        `${baseUrl}/v1/public/payment-link/resolve?ref=${encodeURIComponent(sessionId)}`,
        { headers: { Accept: "application/json" } },
      )
      const body = (await res.json()) as { data?: { sessionId: string }; error?: string }
      if (!res.ok || !body.data) throw new Error(body.error ?? `resolve failed: ${res.status}`)
      return body.data
    },
  })

  if (sessionQuery.isLoading || configQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (sessionMissing) {
    if (resolveQuery.isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (resolveQuery.data?.sessionId && resolveQuery.data.sessionId !== sessionId) {
      return renderResolvedSession(resolveQuery.data.sessionId)
    }
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <h1 className="font-semibold text-xl">{t.notFoundTitle}</h1>
        <p className="max-w-md text-muted-foreground text-sm">{t.notFoundBody}</p>
      </div>
    )
  }

  // Narrowed by the `sessionMissing` early return above.
  if (!sessionQuery.data?.data) return null
  const session = sessionQuery.data.data
  const bankTransfer = configQuery.data?.bankTransfer ?? null
  const bankTransferInstructions: BankTransferInstructions | undefined = bankTransfer
    ? {
        beneficiaryName: bankTransfer.beneficiary,
        iban: bankTransfer.iban,
        bankName: bankTransfer.bankName ?? undefined,
        notes: bankTransfer.notes ?? undefined,
      }
    : undefined

  // Trip sessions render the trip card; booking-attached sessions render
  // the booking card (built from snapshot columns so OTAs work). When
  // either is "ready" we hide the default notes paragraph so the
  // structured content carries the message.
  const summaryNode = tripSummary.status !== "empty" ? tripSummary.node : bookingSummary.node
  const suppressNotes = tripSummary.status !== "empty" || bookingSummary.status !== "empty"

  return (
    <PaymentLinkLandingPage
      session={session}
      bankTransferInstructions={bankTransferInstructions}
      cardPaymentAvailable={configQuery.data?.cardPayments?.available ?? true}
      summary={summaryNode}
      suppressNotes={suppressNotes}
      onRetry={async () => {
        const res = await fetcher(`${baseUrl}/v1/public/payment-link/${sessionId}/retry`, {
          method: "POST",
          headers: { Accept: "application/json" },
        })
        const body = (await res.json()) as {
          data?: { sessionId: string }
          error?: string
        }
        if (!res.ok || !body.data) {
          throw new Error(body.error ?? t.retryFailed)
        }
        // Hard navigation — drops React Query cache for the dead session and
        // gives the new session id a clean URL.
        onRetrySession(body.data.sessionId)
      }}
    />
  )
}
