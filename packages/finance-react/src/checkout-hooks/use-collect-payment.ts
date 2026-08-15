"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  InitiateCheckoutCollectionInput,
  InitiatedCheckoutCollectionRecord,
} from "@voyant-travel/finance/checkout"
import type { PaymentChoice } from "../checkout-types.js"
import { useVoyantFinanceContext } from "../provider.js"

export interface UseCollectPaymentOptions {
  /**
   * Provider id registered in checkout's `paymentStarters` map. Only used
   * when the choice is `send_link`.
   *
   * Leave it unset — which is the normal case. Processor selection is
   * deployment-owned, and a link generated here does not start a processor:
   * the customer-facing landing page does that later, and whichever adapter
   * the deployment selected claims the session then. Stamping a provider up
   * front mislabels every deployment that runs a different one, and the
   * identity guard on the initiation result then rejects the real processor
   * (voyant#4599). Pass this only to pin a specific starter from the
   * `paymentStarters` map.
   */
  cardProvider?: string
  /** Payer email — used as the recipient for the payment-link notification. */
  payerEmail?: string | null
  /** Payer name — passed through to the payment session (display only). */
  payerName?: string | null
  /**
   * Customer-facing language for the processor's hosted payment page (e.g.
   * the picked CRM person's `preferredLanguage`, the booking locale, or the
   * operator's current locale). When omitted, falls back to the processor's
   * deploy-wide default (e.g. `NETOPIA_LANGUAGE`).
   *
   * Forwarded to `startProvider.payload.language` — Netopia honors it for
   * its hosted page; other processors map their own equivalent field.
   */
  payerLanguage?: string | null
  /**
   * Where the customer's browser should land after a successful (or
   * cancelled) payment on the processor's hosted page. Storefronts pass
   * their own confirmation route; operator-initiated send-link flows
   * typically leave this unset and let the deploy-wide
   * `NETOPIA_REDIRECT_URL` point at the public `/pay/:sessionId` landing.
   */
  returnUrl?: string | null
  cancelUrl?: string | null
  /** Optional vertical-supplied notes attached to the collection. */
  notes?: string | null
}

export interface CollectPaymentInput {
  choice: PaymentChoice
  amountCents: number
  /**
   * Payment schedule this collection settles.
   *
   * Without it checkout picks the *earliest* open schedule on the booking,
   * which is the wrong one whenever an operator is collecting the delta
   * from a Booking Amendment while an older instalment is still due: the
   * payment lands on the instalment and the amendment's obligation stays
   * open, collectable a second time.
   */
  scheduleId?: string | null
}

/**
 * Higher-level collection hook: takes a `PaymentChoice` from `<PaymentStep>`
 * and translates it into the appropriate `initiateCheckoutCollection` call.
 *
 * Routes:
 *   - `hold` → creates a payment session, starts the configured card
 *     processor (so `redirectUrl` is populated), and returns the result.
 *     The customer-facing card vs bank-transfer choice happens later on
 *     the public `/pay/:sessionId` landing page; the admin's job is just
 *     to produce that link and share it.
 *   - any other → throws. `saved_method` / `new_card` / `extra` are
 *     vertical-specific (immediate-charge or vertical action) and the
 *     parent handles them by calling `useInitiateCheckoutCollection`
 *     directly with its own request body.
 */
export function useCollectPayment(bookingId: string, options: UseCollectPaymentOptions = {}) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const qc = useQueryClient()
  const { cardProvider, payerEmail, payerName, payerLanguage, returnUrl, cancelUrl, notes } =
    options

  return useMutation({
    mutationFn: async ({
      choice,
      amountCents,
      scheduleId,
    }: CollectPaymentInput): Promise<InitiatedCheckoutCollectionRecord> => {
      const body = mapChoiceToRequest(choice, amountCents, {
        scheduleId,
        cardProvider,
        payerEmail,
        payerName,
        payerLanguage,
        returnUrl,
        cancelUrl,
        notes,
      })
      const response = await fetcher(
        `${baseUrl}/v1/admin/finance/bookings/${bookingId}/initiate-collection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = (await response.json()) as
        | { data: InitiatedCheckoutCollectionRecord }
        | { error: string }
      if (!response.ok) {
        const message = "error" in json ? json.error : `Collection failed: ${response.status}`
        throw new Error(message)
      }
      return (json as { data: InitiatedCheckoutCollectionRecord }).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings", bookingId] })
      qc.invalidateQueries({ queryKey: ["public-booking-payments", bookingId] })
    },
  })
}

function mapChoiceToRequest(
  choice: PaymentChoice,
  amountCents: number,
  ctx: {
    scheduleId?: string | null
    cardProvider?: string
    payerEmail?: string | null
    payerName?: string | null
    payerLanguage?: string | null
    returnUrl?: string | null
    cancelUrl?: string | null
    notes?: string | null
  },
): InitiateCheckoutCollectionInput {
  if (choice.type === "hold") {
    // Deliberately no `startProvider` here. Processors like Netopia
    // require a real billing block at provider-start time, which the
    // admin doesn't have at link-generation time. The customer-facing
    // `/pay/:sessionId` landing lazy-starts the processor (via the
    // template's `POST /v1/public/payment-link/:sessionId/start-card`
    // endpoint) with synthesized placeholder billing — the processor's
    // hosted form then collects the real billing from the customer.
    //
    // `provider` therefore stays unset unless the caller pinned one: the
    // session is provider-agnostic until that lazy start, and the adapter
    // that actually runs is the one that claims it.
    return {
      method: "card",
      stage: "manual",
      amountCents,
      scheduleId: ctx.scheduleId ?? undefined,
      ensureDefaultPaymentPlan: true,
      paymentSession: {
        provider: ctx.cardProvider,
        payerEmail: ctx.payerEmail ?? undefined,
        payerName: ctx.payerName ?? undefined,
        returnUrl: ctx.returnUrl ?? undefined,
        cancelUrl: ctx.cancelUrl ?? undefined,
      },
      // No auto-email by design — the admin shares the link manually.
      // Starters that want auto-email back can call
      // `useInitiateCheckoutCollection` directly with `paymentSessionNotification`.
      notes: ctx.notes ?? undefined,
    }
  }
  throw new Error(
    `useCollectPayment doesn't handle choice type "${choice.type}" — call useInitiateCheckoutCollection directly with a vertical-specific request.`,
  )
}
