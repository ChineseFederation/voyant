"use client"

import type { PublicPaymentSession } from "@voyant-travel/finance/public-validation"
import { formatMessage } from "@voyant-travel/i18n"
import { Alert, AlertDescription, AlertTitle } from "@voyant-travel/ui/components/alert"
import { Button } from "@voyant-travel/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { cn } from "@voyant-travel/ui/lib/utils"
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  TriangleAlert,
} from "lucide-react"
import { type ComponentType, type ReactNode, useCallback, useRef, useState } from "react"

import type { CheckoutUiMessages } from "../checkout-i18n/messages.js"
import {
  useCheckoutUiI18nOrDefault,
  useCheckoutUiMessagesOrDefault,
} from "../checkout-i18n/provider.js"
import type { VoyantFetcher } from "../client.js"
import { useVoyantFinanceContext } from "../provider.js"

/** The handoff arm the page can act on without leaving the storefront. */
type EmbeddedCheckout = Extract<NonNullable<PublicPaymentSession["checkout"]>, { kind: "embedded" }>

interface StartCardResponse {
  data?: { redirectUrl: string | null; checkout?: PublicPaymentSession["checkout"] }
  error?: string
}

function shouldStartCardPayment(session: PublicPaymentSession) {
  return session.status === "pending"
}

function asEmbeddedCheckout(
  checkout: PublicPaymentSession["checkout"] | undefined,
): EmbeddedCheckout | null {
  return checkout && checkout.kind === "embedded" ? checkout : null
}

/**
 * What the page tells the server it can render.
 *
 * `undefined` — not an empty array — when it cannot mount a form: the server
 * reads an absent field as redirect-only, and sending nothing is what keeps
 * this request identical to the one older clients send.
 */
export function acceptedCheckoutHandoffsForPage(
  canMountEmbeddedForm: boolean,
): readonly ("embedded" | "redirect")[] | undefined {
  return canMountEmbeddedForm ? ["embedded", "redirect"] : undefined
}

export type StartCardOutcome =
  | { kind: "embedded"; checkout: EmbeddedCheckout }
  | { kind: "redirect"; url: string }
  | { kind: "error" }

/**
 * Read a start-card response into the one thing the page should do next.
 *
 * A page that cannot mount a form ignores an embedded arm entirely rather than
 * trusting the server not to have sent one — the two ends negotiate, but only
 * this side knows what it can actually render.
 */
export function resolveStartCardOutcome(
  data: StartCardResponse["data"],
  canMountEmbeddedForm: boolean,
): StartCardOutcome {
  const embedded = canMountEmbeddedForm ? asEmbeddedCheckout(data?.checkout) : null
  if (embedded) return { kind: "embedded", checkout: embedded }
  if (data?.redirectUrl) return { kind: "redirect", url: data.redirectUrl }
  return { kind: "error" }
}

/**
 * Integration seam for a provider's in-page payment form (Stripe Elements,
 * Adyen Drop-in, Braintree Hosted Fields, ...).
 *
 * The deployment supplies the component; this package never imports a provider
 * SDK, so the storefront bundle stays vendor-neutral. The secret arrives
 * through `fetchClientSecret` rather than as a prop so it is not sitting in the
 * rendered tree.
 */
export interface PaymentEmbeddedCheckoutClientProps {
  publishableKey: string
  providerAccountId?: string | null
  fetchClientSecret: () => Promise<string>
  amountCents: number
  currency: string
  /** Call when the provider reports the payment as submitted successfully. */
  onComplete: () => void
  onError: (message: string) => void
}

export type PaymentEmbeddedCheckoutClient = ComponentType<PaymentEmbeddedCheckoutClientProps>

/**
 * Renders the deployment's embedded form, or says so plainly when none is
 * wired.
 *
 * Reaching the fallback means something upstream mis-negotiated: the page only
 * asks for the embedded arm when it has a client to mount it with. It exists so
 * that mistake shows as a message the payer can act on rather than a blank
 * panel.
 */
function EmbeddedCheckoutBoundary({
  checkout,
  client: Client,
  session,
  onComplete,
  onError,
  fallbackTitle,
  fallbackBody,
}: {
  checkout: EmbeddedCheckout
  client?: PaymentEmbeddedCheckoutClient
  session: PublicPaymentSession
  onComplete: () => void
  onError: (message: string) => void
  fallbackTitle: string
  fallbackBody: string
}) {
  const initialClientSecret = useRef<string | null>(checkout.clientSecret)
  const fetchClientSecret = useCallback(async () => {
    const initial = initialClientSecret.current
    if (initial) {
      initialClientSecret.current = null
      return initial
    }
    // The token is single-use and the page holds no way to mint another;
    // re-mounting the link is what issues a fresh session.
    throw new Error(fallbackBody)
  }, [fallbackBody])

  if (!Client) {
    return (
      <Alert>
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{fallbackTitle}</AlertTitle>
        <AlertDescription>{fallbackBody}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Client
      amountCents={session.amountCents}
      currency={session.currency}
      fetchClientSecret={fetchClientSecret}
      onComplete={onComplete}
      onError={onError}
      providerAccountId={checkout.providerAccountId}
      publishableKey={checkout.publishableKey}
    />
  )
}

/**
 * Universal landing page rendered at `/pay/:sessionId`. The customer lands
 * here from a payment-link email (or after returning from the processor's
 * hosted checkout). Vertical-agnostic — same component for a flight order,
 * a hotel deposit, or a cruise balance.
 *
 * The parent owns:
 *   - fetching `PublicPaymentSession` from `/v1/public/payment-sessions/:id`
 *     (typically via `usePublicPaymentSession` from `@voyant-travel/finance-react`)
 *   - re-fetching after the user returns from the processor (the processor
 *     redirects back to `session.returnUrl`; the page re-mounts and the
 *     latest status is shown)
 *   - sourcing the bank-transfer block from template config
 *
 * See `docs/architecture/payments-architecture.md` §Core Rule 4.
 */
export interface PaymentLinkLandingPageProps {
  session: PublicPaymentSession
  /** Bank-transfer instructions block — template-supplied per deployment. */
  bankTransferInstructions?: BankTransferInstructions
  /** Header slot (logo, brand name, optional support contact). */
  brandHeader?: ReactNode
  /** Footer slot (T&Cs link, support contact, privacy). */
  brandFooter?: ReactNode
  /**
   * Fired when the customer clicks "Pay by card" — the parent typically
   * redirects to `session.redirectUrl` (the processor's hosted checkout).
   */
  onPayByCard?: () => void
  /**
   * The deployment's in-page payment form. Supplying it is what makes this
   * page ask the processor for an embedded handoff at all — without it the
   * page requests a redirect, exactly as it always did.
   */
  embeddedCheckoutClient?: PaymentEmbeddedCheckoutClient
  /**
   * Optional human-readable description shown above the amount. Sourced
   * from the booking / invoice / vertical context (the session record
   * itself doesn't carry a description today).
   */
  description?: string
  /**
   * Optional structured summary slot rendered above the payment methods.
   * Templates use this to surface vertical-specific context (itinerary
   * cards with thumbnails for trips, line items for invoices, etc.).
   */
  summary?: ReactNode
  /**
   * Hide the raw `session.notes` paragraph in the header. Templates set this
   * when the `summary` slot already conveys the same content in a
   * structured form (so customers don't see the same data twice).
   */
  suppressNotes?: boolean
  /**
   * Fired when the customer clicks "Try again" on a failed payment.
   * Should create a fresh `payment_session` (the original one is dead)
   * and redirect the customer to its landing page. The parent typically
   * POSTs to `/v1/public/payment-link/:sessionId/retry` and navigates to
   * `/pay/{newSessionId}` with the result. When omitted, the failed
   * panel renders no retry CTA at all (clearer than a button that
   * re-opens the dead processor URL).
   */
  onRetry?: () => Promise<void> | void
}

export interface BankTransferInstructions {
  beneficiaryName: string
  iban: string
  bic?: string
  bankName?: string
  /**
   * Reference the customer must include in their wire so finance can
   * reconcile the inbound transfer. Defaults to the session's
   * `externalReference` / `clientReference` / `id` when not supplied.
   */
  reference?: string
  /** Free-text notes — surfaced under the IBAN block. */
  notes?: string
}

export function PaymentLinkLandingPage({
  session,
  bankTransferInstructions,
  brandHeader,
  brandFooter,
  embeddedCheckoutClient,
  onPayByCard,
  onRetry,
  description,
  summary,
  suppressNotes,
}: PaymentLinkLandingPageProps) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const apiClient = { baseUrl, fetcher }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8">
      {brandHeader}
      <Header session={session} description={description} suppressNotes={suppressNotes} />
      {summary ? <div>{summary}</div> : null}
      <Body
        session={session}
        bankTransferInstructions={bankTransferInstructions}
        embeddedCheckoutClient={embeddedCheckoutClient}
        onPayByCard={onPayByCard}
        onRetry={onRetry}
        apiClient={apiClient}
      />
      {brandFooter}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Header({
  session,
  description,
  suppressNotes,
}: {
  session: PublicPaymentSession
  description?: string
  suppressNotes?: boolean
}) {
  const i18n = useCheckoutUiI18nOrDefault()
  const messages = i18n.messages.paymentLinkLandingPage
  return (
    <header className="flex flex-col gap-2 border-b pb-4">
      <h1 className="font-semibold text-2xl">
        {description ?? defaultDescription(session, messages)}
      </h1>
      {!suppressNotes && session.notes ? (
        <p className="whitespace-pre-line text-muted-foreground text-sm">{session.notes}</p>
      ) : null}
      <div className="flex items-baseline gap-3">
        <span className="font-semibold text-3xl tabular-nums">
          {i18n.formatCurrency(session.amountCents / 100, session.currency)}
        </span>
        {session.expiresAt && session.status !== "paid" && (
          <span className="text-muted-foreground text-sm">
            {formatMessage(messages.expires, {
              date: i18n.formatDateTime(session.expiresAt, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </span>
        )}
      </div>
    </header>
  )
}

function Body({
  session,
  embeddedCheckoutClient,
  bankTransferInstructions,
  onPayByCard,
  onRetry,
  apiClient,
}: {
  session: PublicPaymentSession
  bankTransferInstructions?: BankTransferInstructions
  embeddedCheckoutClient?: PaymentEmbeddedCheckoutClient
  onPayByCard?: () => void
  onRetry?: () => Promise<void> | void
  apiClient: PaymentLinkApiClient
}) {
  const messages = useCheckoutUiMessagesOrDefault().paymentLinkLandingPage
  // Terminal states — short-circuit body to a status panel.
  if (session.status === "paid") return <TerminalState status="paid" reason={null} />
  if (session.status === "failed") {
    return (
      <TerminalState status="failed" reason={session.failureMessage ?? null} onRetry={onRetry} />
    )
  }
  if (session.status === "expired") return <TerminalState status="expired" reason={null} />
  if (session.status === "cancelled") return <TerminalState status="cancelled" reason={null} />
  if (session.status === "processing" || session.status === "authorized") {
    return <ProcessingState />
  }

  const cardAvailable =
    Boolean(session.redirectUrl) ||
    Boolean(session.provider) ||
    session.status === "requires_redirect"
  const bankAvailable = Boolean(bankTransferInstructions)

  // No method available — soft fallback (rare; signals a misconfigured
  // session that has neither a redirect URL nor a bank-transfer block).
  if (!cardAvailable && !bankAvailable) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 text-sm">
        <p className="font-medium">{messages.noMethods.title}</p>
        <p className="mt-2 text-muted-foreground">{messages.noMethods.body}</p>
      </div>
    )
  }

  // Single method — render inline without tabs.
  if (cardAvailable && !bankAvailable) {
    return (
      <CardPanel
        session={session}
        embeddedCheckoutClient={embeddedCheckoutClient}
        onPayByCard={onPayByCard}
        apiClient={apiClient}
      />
    )
  }
  if (bankAvailable && !cardAvailable && bankTransferInstructions) {
    return <BankTransferPanel session={session} instructions={bankTransferInstructions} />
  }

  // Both methods — tab strip.
  return (
    <Tabs defaultValue="card" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="card">
          <CreditCard className="mr-2 h-4 w-4" />
          {messages.cardTab}
        </TabsTrigger>
        <TabsTrigger value="bank">
          <Building2 className="mr-2 h-4 w-4" />
          {messages.bankTab}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="card" className="mt-4">
        <CardPanel
          session={session}
          embeddedCheckoutClient={embeddedCheckoutClient}
          onPayByCard={onPayByCard}
          apiClient={apiClient}
        />
      </TabsContent>
      <TabsContent value="bank" className="mt-4">
        {bankTransferInstructions && (
          <BankTransferPanel session={session} instructions={bankTransferInstructions} />
        )}
      </TabsContent>
    </Tabs>
  )
}

function CardPanel({
  session,
  embeddedCheckoutClient,
  onPayByCard,
  apiClient,
}: {
  session: PublicPaymentSession
  embeddedCheckoutClient?: PaymentEmbeddedCheckoutClient
  onPayByCard?: () => void
  apiClient: PaymentLinkApiClient
}) {
  const i18n = useCheckoutUiI18nOrDefault()
  const messages = i18n.messages.paymentLinkLandingPage
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A handoff already on the session is only mountable if this page has a form
  // to mount it in; otherwise it is ignored and the redirect path runs.
  const [embedded, setEmbedded] = useState<EmbeddedCheckout | null>(() =>
    embeddedCheckoutClient ? asEmbeddedCheckout(session.checkout) : null,
  )

  const handleClick = async () => {
    if (onPayByCard) {
      onPayByCard()
      return
    }
    if (session.redirectUrl && !shouldStartCardPayment(session)) {
      window.location.href = session.redirectUrl
      return
    }
    // Lazy-start the configured processor. Asking for the embedded arm only
    // when a client is wired is what keeps a redirect-only page working
    // against a processor that supports in-page payment.
    setStarting(true)
    setError(null)
    try {
      const res = await apiClient.fetcher(
        joinUrl(apiClient.baseUrl, `/v1/public/payment-link/${session.id}/start-card`),
        {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            acceptedCheckoutHandoffs: acceptedCheckoutHandoffsForPage(
              Boolean(embeddedCheckoutClient),
            ),
          }),
        },
      )
      const body = (await res.json()) as StartCardResponse
      if (!res.ok) throw new Error(body.error ?? messages.card.startFailed)
      const outcome = resolveStartCardOutcome(body.data, Boolean(embeddedCheckoutClient))
      if (outcome.kind === "error") throw new Error(body.error ?? messages.card.startFailed)
      if (outcome.kind === "embedded") {
        setEmbedded(outcome.checkout)
        setStarting(false)
        return
      }
      window.location.href = outcome.url
    } catch (err) {
      setError((err as Error).message)
      setStarting(false)
    }
  }

  if (embedded) {
    return (
      <div className="rounded-md border bg-card p-6 shadow-sm">
        <p className="mb-4 text-muted-foreground text-sm">{messages.card.embeddedDescription}</p>
        <EmbeddedCheckoutBoundary
          checkout={embedded}
          client={embeddedCheckoutClient}
          fallbackBody={messages.card.embeddedUnavailableBody}
          fallbackTitle={messages.card.embeddedUnavailableTitle}
          onComplete={() => {
            // The provider confirms server-side through the processor callback;
            // reloading is what re-reads the session in its settled state.
            window.location.href = session.returnUrl ?? window.location.href
          }}
          onError={setError}
          session={session}
        />
        {error && (
          <p className="mt-3 text-destructive text-xs">
            {formatMessage(messages.card.errorAdvice, { message: error })}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card p-6 shadow-sm">
      <p className="mb-4 text-muted-foreground text-sm">{messages.card.description}</p>
      <Button className="w-full" disabled={starting} onClick={handleClick}>
        {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {formatMessage(messages.card.payAmount, {
          amount: i18n.formatCurrency(session.amountCents / 100, session.currency),
        })}
        {!starting && <ExternalLink className="ml-2 h-4 w-4" />}
      </Button>
      {error && (
        <p className="mt-3 text-destructive text-xs">
          {formatMessage(messages.card.errorAdvice, { message: error })}
        </p>
      )}
    </div>
  )
}

interface PaymentLinkApiClient {
  baseUrl: string
  fetcher: VoyantFetcher
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${trimmedPath}`
}

function BankTransferPanel({
  session,
  instructions,
}: {
  session: PublicPaymentSession
  instructions: BankTransferInstructions
}) {
  const i18n = useCheckoutUiI18nOrDefault()
  const messages = i18n.messages.paymentLinkLandingPage
  const reference =
    instructions.reference ?? session.externalReference ?? session.clientReference ?? session.id
  return (
    <div className="rounded-md border bg-card p-6 shadow-sm">
      <p className="mb-4 text-muted-foreground text-sm">
        {formatMessage(messages.bank.instructions, {
          amount: i18n.formatCurrency(session.amountCents / 100, session.currency),
        })}
      </p>
      <dl className="grid grid-cols-1 gap-2 text-sm">
        <Row label={messages.bank.beneficiary}>{instructions.beneficiaryName}</Row>
        <Row label={messages.bank.iban} copyValue={instructions.iban}>
          <span className="font-mono">{instructions.iban}</span>
        </Row>
        {instructions.bic && (
          <Row label={messages.bank.bicSwift} copyValue={instructions.bic}>
            <span className="font-mono">{instructions.bic}</span>
          </Row>
        )}
        {instructions.bankName && <Row label={messages.bank.bank}>{instructions.bankName}</Row>}
        <Row label={messages.bank.reference} copyValue={reference}>
          <span className="font-mono">{reference}</span>
        </Row>
      </dl>
      {instructions.notes && (
        <p className="mt-4 text-muted-foreground text-xs">{instructions.notes}</p>
      )}
    </div>
  )
}

function Row({
  label,
  children,
  copyValue,
}: {
  label: string
  children: ReactNode
  copyValue?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
      <dt className="text-muted-foreground text-xs uppercase tracking-wider">{label}</dt>
      <dd className="flex items-center gap-2">
        {children}
        {copyValue && <CopyButton value={copyValue} />}
      </dd>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const messages = useCheckoutUiMessagesOrDefault().paymentLinkLandingPage
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? messages.copy.copied : formatMessage(messages.copy.copyValue, { value })}
      className="text-muted-foreground transition-colors hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Older browsers without clipboard API — no-op; the value is still
          // visible and selectable for manual copy.
        }
      }}
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

function TerminalState({
  status,
  reason,
  onRetry,
}: {
  status: "paid" | "failed" | "expired" | "cancelled"
  reason: string | null
  onRetry?: () => Promise<void> | void
}) {
  const messages = useCheckoutUiMessagesOrDefault().paymentLinkLandingPage
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const cfg = {
    paid: {
      icon: <CheckCircle2 className="h-10 w-10 text-emerald-600" />,
      title: messages.terminal.paid.title,
      body: messages.terminal.paid.body,
      tone: "border-emerald-500/40 bg-emerald-500/5",
    },
    failed: {
      icon: <CircleAlert className="h-10 w-10 text-destructive" />,
      title: messages.terminal.failed.title,
      body: reason ?? messages.terminal.failed.body,
      tone: "border-destructive/40 bg-destructive/5",
    },
    expired: {
      icon: <CircleAlert className="h-10 w-10 text-amber-600" />,
      title: messages.terminal.expired.title,
      body: messages.terminal.expired.body,
      tone: "border-amber-500/40 bg-amber-500/5",
    },
    cancelled: {
      icon: <CircleAlert className="h-10 w-10 text-muted-foreground" />,
      title: messages.terminal.cancelled.title,
      body: messages.terminal.cancelled.body,
      tone: "border-border bg-muted/20",
    },
  }[status]

  return (
    <div
      className={cn("flex flex-col items-center gap-3 rounded-xl border p-8 text-center", cfg.tone)}
    >
      {cfg.icon}
      <h2 className="font-semibold text-lg">{cfg.title}</h2>
      <p className="max-w-md text-muted-foreground text-sm">{cfg.body}</p>
      {status === "failed" && onRetry && (
        <>
          <Button
            className="mt-2"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true)
              setRetryError(null)
              try {
                await onRetry()
              } catch (err) {
                setRetryError((err as Error).message)
                setRetrying(false)
              }
            }}
          >
            {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {messages.terminal.tryAgain}
          </Button>
          {retryError && <p className="text-destructive text-xs">{retryError}</p>}
        </>
      )}
    </div>
  )
}

function ProcessingState() {
  const messages = useCheckoutUiMessagesOrDefault().paymentLinkLandingPage
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border bg-card p-8 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      <h2 className="font-semibold text-lg">{messages.processing.title}</h2>
      <p className="max-w-md text-muted-foreground text-sm">{messages.processing.body}</p>
    </div>
  )
}

function defaultDescription(
  session: PublicPaymentSession,
  messages: CheckoutUiMessages["paymentLinkLandingPage"],
): string {
  return messages.descriptions[session.targetType] ?? messages.descriptions.default
}
