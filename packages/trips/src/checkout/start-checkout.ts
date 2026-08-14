import { buildConfiguredPaymentLinkUrl, financeService } from "@voyant-travel/finance"

import type { TripCheckoutInput, TripCheckoutResult } from "../service.js"
import { formatTripBillingName, readTripBilling, synthesizeTripBilling } from "./billing.js"
import { buildTripPaymentSummary, checkoutPricingForTrip } from "./pricing.js"
import type { TripCheckoutDeps } from "./types.js"

/**
 * Orchestrate a trip checkout: price the trip's components into the collection
 * currency, create the finance payment session, optionally start the payment
 * provider, and return the customer-facing checkout link / bank-transfer
 * instructions.
 *
 * Finance (`createPaymentSession` + `buildPaymentLinkUrl`) is composed
 * directly. The deployment supplies FX quoting, the checkout base URL, and the
 * payment-provider start via `deps`.
 */
export async function startTripCheckout(
  deps: TripCheckoutDeps,
  input: TripCheckoutInput,
): Promise<TripCheckoutResult> {
  const db = deps.db as Parameters<typeof financeService.createPaymentSession>[0]
  const pricing = await checkoutPricingForTrip(deps.quoteFx, input.trip, input.request)
  if (pricing.totalAmountCents <= 0) {
    throw new Error("trip_checkout_total_required")
  }

  const billing = readTripBilling(input.trip.envelope.travelerParty)
  const payerName = formatTripBillingName(billing)
  const payerEmail = billing.contact?.email ?? null
  if (!payerName || !payerEmail) {
    throw new Error("trip_checkout_billing_required")
  }
  const paymentMethod = input.intent === "bank_transfer" ? "bank_transfer" : "credit_card"
  const session = await financeService.createPaymentSession(db, {
    targetType: "other",
    targetId: input.trip.envelope.id,
    idempotencyKey: `trip-checkout:${input.trip.envelope.id}:${pricing.currency}:${pricing.totalAmountCents}`,
    clientReference: input.trip.envelope.id,
    currency: pricing.currency,
    amountCents: pricing.totalAmountCents,
    status: "pending",
    provider: null,
    paymentMethod,
    payerPersonId: billing.personId ?? null,
    payerOrganizationId: billing.organizationId ?? null,
    payerEmail,
    payerName,
    notes: buildTripPaymentSummary(input.trip, pricing.currency, pricing.allocations),
    metadata: {
      tripEnvelopeId: input.trip.envelope.id,
      collectionCurrency: pricing.currency,
      componentAllocations: pricing.allocations,
      fxAllocations: pricing.allocations.filter((allocation) => allocation.fx),
    },
  })
  if (!session) {
    throw new Error("trip_checkout_session_create_failed")
  }

  if (input.intent !== "bank_transfer") {
    try {
      if (deps.startProviderPayment) {
        await deps.startProviderPayment({
          paymentSessionId: session.id,
          billing: synthesizeTripBilling(billing),
          description: `Trip ${input.trip.envelope.id}`,
          trip: input.trip,
        })
      }
    } catch (error) {
      console.warn("[trips] payment adapter start failed for trip payment session:", error)
    }
  }

  return {
    kind: input.intent === "bank_transfer" ? "bank_transfer_instructions" : "payment_session",
    paymentSessionId: session.id,
    checkoutUrl: buildConfiguredPaymentLinkUrl(session.id, {
      paymentLinkUrlTemplate: await deps.resolvePaymentLinkUrlTemplate(),
      publicCheckoutBaseUrl: deps.resolveCheckoutBaseUrl(),
    }),
  }
}
