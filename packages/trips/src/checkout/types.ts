import type { Trip, TripCheckoutInput, TripCheckoutResult } from "../service.js"

/** A per-component currency allocation produced while pricing a trip checkout. */
export interface TripCheckoutAllocation {
  componentId: string
  kind: string
  bookingId: string | null
  orderId: string | null
  sourceCurrency: string
  sourceAmountCents: number
  targetCurrency: string
  targetAmountCents: number
  fx?: {
    rate: number
    provider: "voyant_data_fx"
    quotedAt: string
    validUntil?: string | null
  }
}

/** A resolved FX quote between two currencies. */
export interface FxQuote {
  rate: number
  quotedAt: string
  validUntil?: string | null
}

/** Billing details extracted from a trip's traveler party. */
export interface TripBillingInfo {
  buyerType?: string | null
  personId?: string | null
  organizationId?: string | null
  contact?: {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
  }
}

/** Synthesized billing payload handed to a payment provider. */
export interface SynthesizedTripBilling {
  email: string
  phone: string
  firstName: string
  lastName: string
  city: string
  country: number
  state: string
  postalCode: string
  details: string
}

/**
 * Deployment-supplied dependencies for the trip-checkout orchestration. The
 * trips package composes finance (`createPaymentSession` + payment-link URL)
 * directly, but everything that is a deployment provider choice — FX rates,
 * the public checkout base URL, and the payment-provider start (Netopia) —
 * is injected here.
 */
export interface TripCheckoutDeps {
  /** The finance-compatible drizzle db used for `createPaymentSession`. */
  db: unknown
  /**
   * Quote an FX rate from `sourceCurrency` to `targetCurrency`. Called only
   * when a component's currency differs from the collection currency.
   */
  quoteFx(sourceCurrency: string, targetCurrency: string): Promise<FxQuote>
  /**
   * Resolve the customer-facing checkout base URL used to build the payment
   * link. May return `null`; without a template or this compatibility base,
   * checkout returns no customer URL.
   */
  resolveCheckoutBaseUrl(): string | null
  /** Resolve the organization override or host-provided payment-link template. */
  resolvePaymentLinkUrlTemplate(): Promise<string | null>
  /**
   * Start the payment-provider session for a non-bank-transfer checkout. This
   * is best-effort; the orchestration logs and continues on failure. Omit to
   * skip provider start entirely.
   */
  startProviderPayment?(args: {
    paymentSessionId: string
    billing: SynthesizedTripBilling
    description: string
    trip: Trip
  }): Promise<void>
}

export type { Trip, TripCheckoutInput, TripCheckoutResult }
