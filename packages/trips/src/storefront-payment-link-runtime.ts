/** Standard statically composed payment-link runtime selected by Storefront. */

import type { CommerceCardPaymentRuntime } from "@voyant-travel/commerce/runtime-port"
import { productMedia, products } from "@voyant-travel/inventory/schema"
import {
  getOperatorPaymentInstructions,
  getOperatorProfile,
} from "@voyant-travel/operator-settings"
import type {
  PaymentAdapter,
  PaymentAdapterRuntimeContext,
  PaymentCheckoutHandoff,
  PaymentHostedCheckout,
} from "@voyant-travel/payments"
import type {
  PaymentLinkRoutesOptions,
  PaymentLinkTripData,
} from "@voyant-travel/storefront/payment-link"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { tripComponents, tripEnvelopes } from "./schema.js"
import { tripsService } from "./service.js"

const FINANCE_CARD_PAYMENT_MODULE = "@voyant-travel/finance/card-payment"

type StartCardPayment = ReturnType<CommerceCardPaymentRuntime["createStartCardPayment"]>
/** Commerce's neutral port result. Redirect-only by contract. */
type CardPaymentStartResult = Awaited<ReturnType<NonNullable<StartCardPayment>>>
/**
 * Finance's adapter starter result, which is wider than Commerce's port: it
 * also carries the chosen handoff. Deriving this from Commerce used to work
 * only because the two happened to agree; they no longer do, and the
 * payment-link route needs the handoff that the booking-engine checkout — still
 * redirect-only — does not.
 */
type AdapterCardPaymentStartResult = {
  redirectUrl: string | null
  checkout: PaymentHostedCheckout | null
} | null
interface AdapterCardPaymentStartArgs {
  db: PostgresJsDatabase
  sessionId: string
  billing: {
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
  description?: string
  returnUrl?: string
  cancelUrl?: string
  shipping?: Record<string, unknown>
  metadata?: Record<string, unknown>
  acceptedCheckoutHandoffs?: readonly PaymentCheckoutHandoff[]
}
type PaymentAdapterCardPaymentStarterFactory = (
  adapter: PaymentAdapter,
  options: {
    resolveContext(c: Context): PaymentAdapterRuntimeContext
    resolveRuntime(c: Context): { eventBus?: unknown }
    idempotencyKey(sessionId: string): string
    resolveNotifyUrl?(c: Context): string | undefined
  },
) => (context: Context, args: AdapterCardPaymentStartArgs) => Promise<AdapterCardPaymentStartResult>

/** Standard selected payment provider exposed through Commerce's neutral port. */
export function createCommerceCardPaymentRuntime(
  adapter: PaymentAdapter,
): CommerceCardPaymentRuntime {
  return {
    createStartCardPayment: (context) => (args) => startAdapterCardPayment(adapter, context, args),
  }
}

async function startAdapterCardPayment(
  adapter: PaymentAdapter,
  context: Context,
  args: Parameters<NonNullable<StartCardPayment>>[0],
): Promise<CardPaymentStartResult> {
  const { createPaymentAdapterCardPaymentStarter } = (await import(
    FINANCE_CARD_PAYMENT_MODULE
  )) as {
    createPaymentAdapterCardPaymentStarter: PaymentAdapterCardPaymentStarterFactory
  }
  const starter = createPaymentAdapterCardPaymentStarter(adapter, {
    resolveContext: (c) => ({ env: c.env }),
    resolveRuntime: (c) => ({ eventBus: c.var.eventBus }),
    idempotencyKey: (sessionId) => `payment:${sessionId}`,
    // Tell the processor to POST its callback/IPN to the deployment's public
    // payment webhook, so payment confirmation is authoritative (server-side)
    // instead of relying on the confirmation-page poll.
    resolveNotifyUrl: (c) => resolvePaymentCallbackUrl(c.env as Record<string, unknown>),
  })
  return starter(context, args)
}

/**
 * The deployment's public payment webhook — where a redirect processor POSTs
 * its server-side confirmation (IPN). The operator API is served under `/api`,
 * so the callback registered at `/v1/public/payment-link/callback` is publicly
 * reachable at `/api/v1/public/payment-link/callback`.
 */
export function resolvePaymentCallbackUrl(bindings: Record<string, unknown>): string | undefined {
  const origin = resolvePaymentCallbackOrigin(bindings)
  return origin ? `${origin}/api/v1/public/payment-link/callback` : undefined
}

interface PaymentConfigBindings {
  APP_URL?: string
  BANK_TRANSFER_BANK_NAME?: string
  BANK_TRANSFER_BENEFICIARY?: string
  BANK_TRANSFER_IBAN?: string
  DASH_BASE_URL?: string
  PAYMENT_CALLBACK_BASE_URL?: string
  PUBLIC_CHECKOUT_BASE_URL?: string
}

function resolvePaymentCallbackOrigin(bindings: Record<string, unknown>): string | undefined {
  const env = bindings as PaymentConfigBindings
  const configured = env.PAYMENT_CALLBACK_BASE_URL?.trim()
  if (configured) return requireHttpOrigin(configured, "PAYMENT_CALLBACK_BASE_URL")

  // Compatibility for deployments created before PAYMENT_CALLBACK_BASE_URL:
  // DASH_BASE_URL and APP_URL describe this operator deployment, so they are
  // safe callback origins. PUBLIC_CHECKOUT_BASE_URL deliberately is not a
  // fallback: it may point at a customer website or a path such as `/pay`.
  const dashboard = env.DASH_BASE_URL?.trim()
  if (dashboard) return requireHttpOrigin(dashboard, "DASH_BASE_URL")

  const app = env.APP_URL?.trim().replace(/\/api\/?$/, "")
  return app ? requireHttpOrigin(app, "APP_URL") : undefined
}

function requireHttpOrigin(value: string, key: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${key} must be an absolute HTTP(S) origin`)
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${key} must be an absolute HTTP(S) origin without a path, query, or hash`)
  }

  return url.origin
}

function resolvePublicCheckoutBaseUrl(bindings: Record<string, unknown>): string | null {
  const env = bindings as PaymentConfigBindings
  return (
    env.PUBLIC_CHECKOUT_BASE_URL?.trim() ||
    env.DASH_BASE_URL?.trim() ||
    env.APP_URL?.trim().replace(/\/api\/?$/, "") ||
    null
  )
}

function resolveEnvironmentBankTransferDetails(bindings: Record<string, unknown>) {
  const env = bindings as PaymentConfigBindings
  if (!env.BANK_TRANSFER_BENEFICIARY || !env.BANK_TRANSFER_IBAN) return null
  return {
    beneficiary: env.BANK_TRANSFER_BENEFICIARY,
    iban: env.BANK_TRANSFER_IBAN,
    bankName: env.BANK_TRANSFER_BANK_NAME ?? null,
  }
}

function getDb(c: Context): PostgresJsDatabase {
  return c.get("db") as PostgresJsDatabase
}

/** Bank-transfer beneficiary details from operator settings merged with env. */
async function resolveBankTransferDetails(c: Context) {
  const db = getDb(c)
  const [operatorProfile, paymentInstructions] = await Promise.all([
    getOperatorProfile(db),
    getOperatorPaymentInstructions(db),
  ])
  const environment = resolveEnvironmentBankTransferDetails(c.env as Record<string, unknown>)
  const beneficiary =
    paymentInstructions?.bankTransferBeneficiary ||
    operatorProfile?.legalName ||
    operatorProfile?.name ||
    environment?.beneficiary
  const iban = paymentInstructions?.iban || environment?.iban
  if (!beneficiary || !iban) return null
  return {
    beneficiary,
    iban,
    bankName: paymentInstructions?.bank || environment?.bankName || null,
  }
}

/** No processor wired (self-host with mocks, or Cloud not connected): the handler 503s. */
const unconfiguredStartCardPayment: PaymentLinkRoutesOptions["startCardPayment"] = async () => ({
  configured: false,
})

/**
 * Start a card payment for a payment-link session via this deployment's selected
 * processor (the same neutral adapter the checkout path uses), returning the
 * handoff it chose. Enables paying a payment link by card, not just the full
 * booking checkout.
 *
 * The accepted handoffs come from the request, because only the page knows
 * whether it can mount an in-page form. This runtime forwards that answer and
 * makes no judgement of its own.
 */
function createAdapterStartCardPayment(
  adapter: PaymentAdapter | Promise<PaymentAdapter>,
): PaymentLinkRoutesOptions["startCardPayment"] {
  return async (c, session) => {
    const resolvedAdapter = await adapter
    const { createPaymentAdapterCardPaymentStarter } = (await import(
      FINANCE_CARD_PAYMENT_MODULE
    )) as {
      createPaymentAdapterCardPaymentStarter: PaymentAdapterCardPaymentStarterFactory
    }
    const starter = createPaymentAdapterCardPaymentStarter(resolvedAdapter, {
      resolveContext: (ctx) => ({ env: ctx.env }),
      resolveRuntime: (ctx) => ({ eventBus: ctx.var.eventBus }),
      idempotencyKey: (sessionId) => `payment:${sessionId}`,
      resolveNotifyUrl: (ctx) => resolvePaymentCallbackUrl(ctx.env as Record<string, unknown>),
    })
    const trimmedName = (session.payerName ?? "").trim()
    const [firstName, ...rest] = trimmedName ? trimmedName.split(/\s+/) : []
    const fallbackBilling = {
      email: session.payerEmail ?? "",
      firstName: firstName || session.payerEmail || "Customer",
      lastName: rest.join(" "),
    }
    const billing = session.billing
      ? { ...session.billing, lastName: session.billing.lastName ?? "" }
      : fallbackBilling
    const result = await starter(c, {
      db: getDb(c),
      sessionId: session.id,
      billing,
      description: session.description ?? session.notes ?? "Payment",
      returnUrl: session.returnUrl,
      cancelUrl: session.cancelUrl,
      shipping: session.shipping,
      acceptedCheckoutHandoffs: session.acceptedCheckoutHandoffs,
    })
    return {
      configured: true,
      redirectUrl: result?.redirectUrl ?? null,
      checkout: result?.checkout ?? null,
    }
  }
}

/**
 * Resolve a trip envelope (+ reconcile a paid checkout) and its visible
 * components with product-media enrichment. Encapsulates the trips + inventory
 * schema reads the package stays free of.
 */
const resolveTripData: PaymentLinkRoutesOptions["resolveTripData"] = async (
  c,
  tripEnvelopeId,
  session,
): Promise<PaymentLinkTripData | null> => {
  const db = getDb(c)

  const [envelope] = await db
    .select()
    .from(tripEnvelopes)
    .where(eq(tripEnvelopes.id, tripEnvelopeId))
    .limit(1)
  if (!envelope) return null

  if (session.status === "paid" && envelope.status !== "booked") {
    try {
      await tripsService.completeTripCheckout(db, {
        envelopeId: envelope.id,
        paymentSessionId: session.id,
        payload: {
          source: "payment_link_trip_summary_reconcile",
          amountCents: session.amountCents,
          currency: session.currency,
          provider: session.provider,
        },
      })
    } catch (err) {
      console.error("[trips] payment summary reconciliation failed", err)
    }
  }

  const components = await db
    .select()
    .from(tripComponents)
    .where(eq(tripComponents.envelopeId, tripEnvelopeId))
    .orderBy(asc(tripComponents.sequence), asc(tripComponents.createdAt))

  const visibleComponents = components.filter(
    (component) => component.status !== "removed" && component.status !== "cancelled",
  )

  const productIds = Array.from(
    new Set(
      visibleComponents
        .map((component) => component.entityId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  )

  const mediaByProductId = new Map<string, { url: string; altText: string | null }>()
  const productNameById = new Map<string, string>()
  if (productIds.length > 0) {
    const productRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(inArray(products.id, productIds))
    for (const row of productRows) productNameById.set(row.id, row.name)
    const mediaRows = await db
      .select({
        productId: productMedia.productId,
        url: productMedia.url,
        altText: productMedia.altText,
        isCover: productMedia.isCover,
        sortOrder: productMedia.sortOrder,
        mediaType: productMedia.mediaType,
      })
      .from(productMedia)
      .where(and(inArray(productMedia.productId, productIds), eq(productMedia.mediaType, "image")))
      .orderBy(asc(productMedia.productId), desc(productMedia.isCover), asc(productMedia.sortOrder))
    for (const row of mediaRows) {
      if (!mediaByProductId.has(row.productId)) {
        mediaByProductId.set(row.productId, { url: row.url, altText: row.altText })
      }
    }
  }

  return {
    envelope: { id: envelope.id, status: envelope.status },
    components: visibleComponents.map((component) => ({
      id: component.id,
      kind: component.kind,
      entityModule: component.entityModule,
      entityId: component.entityId,
      description: component.description,
      status: component.status,
      sequence: component.sequence,
      componentTotalAmountCents: component.componentTotalAmountCents,
      componentCurrency: component.componentCurrency,
      metadata: (component.metadata ?? null) as Record<string, unknown> | null,
    })),
    productNameById,
    mediaByProductId,
  }
}

/**
 * Build the payment-link route-module options for this deployment. When a
 * payment adapter is selected, card payment links charge through it; otherwise
 * the card path reports "not configured" (the handler 503s) and bank transfer
 * still works.
 */
export function createStandardPaymentLinkRouteOptions(
  adapter?: PaymentAdapter | Promise<PaymentAdapter>,
): PaymentLinkRoutesOptions {
  return {
    resolveBankTransferDetails,
    resolvePublicCheckoutBaseUrl: (c) =>
      resolvePublicCheckoutBaseUrl(c.env as Record<string, unknown>),
    startCardPayment: adapter
      ? createAdapterStartCardPayment(adapter)
      : unconfiguredStartCardPayment,
    // Published on `payment-link-config` so the landing page can offer card on
    // a session that has not started one yet — which is every link the
    // operator generates (voyant#4599).
    cardPaymentsConfigured: Boolean(adapter),
    resolveTripData,
  }
}
