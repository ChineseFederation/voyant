"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import type { ReactNode } from "react"

import { useVoyantFinanceContext } from "../provider.js"

/**
 * Public landing for processor redirects that don't carry our session id
 * in the path. Pay-by-link processors (Netopia, etc.) append the order
 * reference they were given when the session was started — that may be
 * the canonical session id, or it may be a `clientReference` /
 * `externalReference` chosen by the operator (e.g. flight order id,
 * booking number).
 *
 * Set `NETOPIA_REDIRECT_URL=${APP_URL}/pay`; this route resolves whichever
 * key the processor returned to the canonical session id via the
 * `/v1/public/payment-link/resolve` endpoint, then forwards to
 * `/pay/$sessionId` for the real status page.
 */
interface ResolveResponse {
  data?: { sessionId: string }
  error?: string
}

export interface PaymentLinkResolverMessages {
  missingIdentifierTitle: string
  missingIdentifierBody: string
  lookingUp: string
  notFoundTitle: string
  notFoundBody: string
}

export interface PaymentLinkResolverPageProps {
  reference: string | null
  messages: PaymentLinkResolverMessages
  renderResolvedSession: (sessionId: string) => ReactNode
}

export function PaymentLinkResolverPage({
  reference,
  messages: t,
  renderResolvedSession,
}: PaymentLinkResolverPageProps) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()

  const resolveQuery = useQuery({
    queryKey: ["payment-link-resolve", reference],
    enabled: Boolean(reference),
    retry: false,
    queryFn: async (): Promise<{ sessionId: string }> => {
      const res = await fetcher(
        `${baseUrl}/v1/public/payment-link/resolve?ref=${encodeURIComponent(reference ?? "")}`,
        { headers: { Accept: "application/json" } },
      )
      const body = (await res.json()) as ResolveResponse
      if (!res.ok || !body.data) {
        throw new Error(body.error ?? `resolve failed: ${res.status}`)
      }
      return body.data
    },
  })

  if (!reference) {
    return <FallbackPanel title={t.missingIdentifierTitle} body={t.missingIdentifierBody} />
  }

  if (resolveQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <h1 className="font-semibold text-xl">{t.lookingUp}</h1>
      </div>
    )
  }

  if (resolveQuery.error || !resolveQuery.data) {
    return <FallbackPanel title={t.notFoundTitle} body={t.notFoundBody} />
  }

  return renderResolvedSession(resolveQuery.data.sessionId)
}

function FallbackPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <h1 className="font-semibold text-xl">{title}</h1>
      <p className="max-w-md text-muted-foreground text-sm">{body}</p>
    </div>
  )
}
