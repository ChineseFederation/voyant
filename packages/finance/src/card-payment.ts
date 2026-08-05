/**
 * Provider-agnostic card-payment seam.
 *
 * Finance defines the neutral contract a deployment's chosen card processor
 * implements; checkout surfaces (flights, trips checkout, payment links,
 * catalog) route card payments through a single `CardPaymentStarter` rather
 * than importing any specific provider. The Netopia (or Stripe/Adyen/…)
 * implementation lives in the provider's own package — finance never names a
 * processor.
 *
 * Returning `null` from a starter means "this processor isn't configured" so
 * callers fall back gracefully (bank-transfer paths still work).
 */
import type {
  PaymentAdapter,
  PaymentAdapterRuntimeContext,
  PaymentCheckoutHandoff,
  PaymentHostedCheckout,
} from "@voyant-travel/payments"
import { paymentCheckoutRedirectUrl } from "@voyant-travel/payments"
import { and, eq, isNull, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { applyPaymentAdapterInitiationResult } from "./payment-adapter-events.js"
import { paymentSessions } from "./schema/payment-sessions.js"
import type { FinanceServiceRuntime } from "./service-shared.js"

const PAYMENT_ADAPTER_INITIATION_CLAIM_KEY = "paymentAdapterInitiationClaim"
const PAYMENT_ADAPTER_INITIATION_STATE_KEY = "paymentAdapterInitiationState"

/**
 * Billing details a card processor needs to start a hosted payment.
 *
 * Field names are kept structurally compatible with a provider's own billing
 * shape (e.g. Netopia's `NetopiaBillingAddress`) so callers' existing billing
 * objects satisfy this without reshaping. `country` accepts a numeric code or
 * ISO string depending on the processor.
 */
export interface CardPaymentBilling {
  email: string
  phone?: string
  firstName: string
  lastName?: string
  city?: string
  country?: number | string
  state?: string
  postalCode?: string
  details?: string
}

/** Arguments a caller maps from its checkout surface to start a card payment. */
export interface CardPaymentStartArgs {
  db: PostgresJsDatabase
  sessionId: string
  billing: CardPaymentBilling
  /**
   * What the shopper is paying for, in `locale`. A hosted-checkout provider
   * renders it as the line item, so it names the product — never an internal
   * identifier.
   */
  description?: string
  /** BCP 47 tag for the language the checkout page should be rendered in. */
  locale?: string
  /**
   * Opaque, stable reference to the caller's own customer record, so a
   * provider can bind a stored customer without keying on the email address.
   * See `PaymentInitiationInput["customer"].reference`.
   */
  customerReference?: string
  returnUrl?: string
  cancelUrl?: string
  shipping?: Record<string, unknown>
  metadata?: Record<string, unknown>
  /**
   * The checkout handoffs the calling surface can actually render, most
   * preferred first. Omitted means `["redirect"]`, so a surface that has not
   * said it can mount an in-page form never receives one.
   */
  acceptedCheckoutHandoffs?: readonly PaymentCheckoutHandoff[]
}

/**
 * Result of a card-payment start.
 *
 * `checkout` is the handoff the processor chose; `redirectUrl` is its
 * redirect-arm projection, kept so every existing caller reads what it always
 * read and gets `null` — not a type error — when the handoff is embedded.
 */
export interface CardPaymentStartResult {
  redirectUrl: string | null
  checkout: PaymentHostedCheckout | null
}

/**
 * The neutral card-payment starter contract. A deployment selects exactly one
 * implementation (its chosen processor) and every checkout surface routes
 * through it.
 *
 * `c` carries the request env + container so a processor can resolve its own
 * request-scoped runtime. Returning `null` means "this processor isn't
 * configured" — callers fall back (bank transfer still works).
 */
export type CardPaymentStarter = (
  c: Context,
  args: CardPaymentStartArgs,
) => Promise<CardPaymentStartResult | null>

export interface PaymentAdapterCardPaymentStarterOptions {
  resolveContext?(c: Context): PaymentAdapterRuntimeContext
  resolveRuntime?(c: Context): FinanceServiceRuntime
  idempotencyKey?(sessionId: string): string
  /**
   * Resolve the public URL a redirect processor should POST its callback/IPN to
   * (the deployment's payment webhook). Passed to the adapter as
   * `metadata.notifyUrl` so the processor confirms server-side; absent when the
   * deployment has no public checkout base (confirmation falls back to polling).
   */
  resolveNotifyUrl?(c: Context): string | undefined
}

export interface PaymentAdapterCardPaymentExecution {
  context: PaymentAdapterRuntimeContext
  runtime?: FinanceServiceRuntime
  notifyUrl?: string
  idempotencyKey?: string
}

/** Resolve the deployment's canonical server-side payment callback URL. */
export function resolvePaymentCallbackUrl(
  env: Readonly<Record<string, unknown>>,
): string | undefined {
  const configured =
    nonEmpty(env.PAYMENT_CALLBACK_BASE_URL) ??
    nonEmpty(env.DASH_BASE_URL) ??
    nonEmpty(env.APP_URL)?.replace(/\/api\/?$/, "")
  if (!configured) return undefined
  const url = new URL(configured)
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Payment callback base must be an absolute HTTP(S) origin")
  }
  return `${url.origin}/api/v1/public/payment-link/callback`
}

/**
 * Start a payment through a selected adapter without requiring an HTTP
 * framework context. Package runtimes use this function; the Hono-oriented
 * starter below remains the checkout-surface convenience wrapper.
 */
export async function startPaymentAdapterCardPayment(
  adapter: PaymentAdapter,
  args: CardPaymentStartArgs,
  execution: PaymentAdapterCardPaymentExecution,
): Promise<CardPaymentStartResult | null> {
  const [initialSession] = await args.db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, args.sessionId))
    .limit(1)
  if (!initialSession) return null

  const idempotencyKey =
    initialSession.idempotencyKey ?? execution.idempotencyKey ?? `payment:${initialSession.id}`
  const [session] = await args.db
    .update(paymentSessions)
    .set({
      status: "processing",
      idempotencyKey,
      metadata: sql`coalesce(${paymentSessions.metadata}, '{}'::jsonb) || ${JSON.stringify({
        [PAYMENT_ADAPTER_INITIATION_CLAIM_KEY]: idempotencyKey,
        [PAYMENT_ADAPTER_INITIATION_STATE_KEY]: "in_flight",
      })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentSessions.id, args.sessionId),
        eq(paymentSessions.status, "pending"),
        isNull(paymentSessions.providerConnectionId),
        isNull(paymentSessions.providerSessionId),
        isNull(paymentSessions.providerPaymentId),
      ),
    )
    .returning()
  if (!session) {
    const [continuation] = await args.db
      .select({ redirectUrl: paymentSessions.redirectUrl, checkout: paymentSessions.checkout })
      .from(paymentSessions)
      .where(eq(paymentSessions.id, args.sessionId))
      .limit(1)
    // The claim was lost to a concurrent start; hand back whatever handoff that
    // start persisted rather than initiating a second payment.
    return continuation
      ? { redirectUrl: continuation.redirectUrl, checkout: continuation.checkout ?? null }
      : null
  }

  const metadata = {
    ...(args.metadata ?? {}),
    billing: args.billing,
    ...(execution.notifyUrl ? { notifyUrl: execution.notifyUrl } : {}),
  }
  let result: Awaited<ReturnType<PaymentAdapter["initiate"]>>
  try {
    result = await adapter.initiate(execution.context, {
      paymentSessionId: session.id,
      money: { amountMinor: session.amountCents, currency: session.currency },
      description: args.description ?? session.notes ?? undefined,
      locale: args.locale,
      returnUrl: args.returnUrl ?? session.returnUrl ?? undefined,
      cancelUrl: args.cancelUrl ?? session.cancelUrl ?? undefined,
      acceptedCheckoutHandoffs: args.acceptedCheckoutHandoffs,
      idempotencyKey,
      customer: {
        reference: args.customerReference ?? null,
        email: args.billing.email,
        phone: args.billing.phone ?? null,
        firstName: args.billing.firstName,
        lastName: args.billing.lastName ?? null,
      },
      shipping: args.shipping,
      metadata,
    })
    await applyPaymentAdapterInitiationResult(
      args.db,
      session.id,
      adapter.id,
      result,
      { idempotencyKey, claimedAt: session.updatedAt },
      execution.runtime,
    )
  } catch (error) {
    const retrySafe =
      adapter.capabilities.idempotencyKeys && adapter.capabilities.retrySafeInitiation
    await args.db
      .update(paymentSessions)
      .set({
        status: retrySafe ? "pending" : "processing",
        metadata: sql`coalesce(${paymentSessions.metadata}, '{}'::jsonb) || ${JSON.stringify({
          [PAYMENT_ADAPTER_INITIATION_CLAIM_KEY]: retrySafe ? null : idempotencyKey,
          [PAYMENT_ADAPTER_INITIATION_STATE_KEY]: retrySafe ? "retryable" : "uncertain",
        })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSessions.id, session.id),
          eq(paymentSessions.status, "processing"),
          eq(paymentSessions.idempotencyKey, idempotencyKey),
          eq(paymentSessions.updatedAt, session.updatedAt),
          isNull(paymentSessions.providerConnectionId),
          isNull(paymentSessions.providerSessionId),
          isNull(paymentSessions.providerPaymentId),
          sql`${paymentSessions.metadata}->>${PAYMENT_ADAPTER_INITIATION_CLAIM_KEY} = ${idempotencyKey}`,
        ),
      )
    throw error
  }

  return {
    redirectUrl: paymentCheckoutRedirectUrl(result.checkout),
    checkout: result.checkout ?? null,
  }
}

export function createPaymentAdapterCardPaymentStarter(
  adapter: PaymentAdapter,
  options: PaymentAdapterCardPaymentStarterOptions = {},
): CardPaymentStarter {
  return async (c, args) => {
    return startPaymentAdapterCardPayment(adapter, args, {
      context: options.resolveContext?.(c) ?? { env: c.env },
      runtime: options.resolveRuntime?.(c),
      notifyUrl: options.resolveNotifyUrl?.(c),
      idempotencyKey: options.idempotencyKey?.(args.sessionId),
    })
  }
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}
