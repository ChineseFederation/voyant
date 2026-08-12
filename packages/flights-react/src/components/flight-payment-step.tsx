"use client"

import {
  type PaymentChoice,
  PaymentStep,
  type PaymentStepCapabilities,
  type PaymentStepExtraOption,
  type SavedPaymentAccount,
} from "@voyant-travel/finance-react/checkout-ui"
import type { PaymentIntent } from "@voyant-travel/flights/contract/types"
import { Landmark } from "lucide-react"
import { useMemo } from "react"
import { useFlightsUiMessagesOrDefault } from "../i18n/index.js"

// Re-export the canonical types so existing flights-ui consumers don't
// need to import from `@voyant-travel/finance-react/checkout-ui` directly.
export type { PaymentStepCapabilities, SavedPaymentAccount }
/** Back-compat alias — older callers used this name; same shape. */
export type SavedPaymentMethod = SavedPaymentAccount

export interface FlightPaymentStepProps {
  /** Flight-contract intent — kept for back-compat with the booking shell. */
  value: PaymentIntent
  onChange: (next: PaymentIntent) => void
  /** Saved methods for the picked person — empty array when none on file. */
  savedMethods: SavedPaymentAccount[]
  loadingSavedMethods?: boolean
  /** Currently selected saved method id (mirror of state held in the parent). */
  selectedSavedId: string | null
  onSelectSaved: (id: string | null) => void
  /**
   * What the active processor / template actually offers for immediate
   * charge flows (`chargeSavedCard`, `newCard`). Hold and the
   * "Issue on agency credit" extra are always rendered.
   *
   * See `docs/architecture/payments-architecture.md` §Core Rule 7.
   */
  capabilities?: PaymentStepCapabilities
}

/**
 * Flight-vertical wrapper around `<PaymentStep>` from `@voyant-travel/finance-react/checkout-ui`.
 * Maps the universal `PaymentChoice` event into the flight contract's
 * `PaymentIntent` shape, and contributes the "Issue ticket on agency
 * credit" extra option (flight-specific).
 */
export function FlightPaymentStep({
  value,
  onChange,
  savedMethods,
  loadingSavedMethods,
  selectedSavedId,
  onSelectSaved,
  capabilities,
}: FlightPaymentStepProps) {
  const messages = useFlightsUiMessagesOrDefault().flightPaymentStep
  const extraAgencyCredit = useMemo<PaymentStepExtraOption>(
    () => ({
      id: "ticket_on_credit",
      label: messages.agencyCreditLabel,
      description: messages.agencyCreditDescription,
      icon: <Landmark className="h-4 w-4 text-muted-foreground" />,
    }),
    [messages],
  )
  const extraOptions = useMemo<ReadonlyArray<PaymentStepExtraOption>>(
    () => [extraAgencyCredit],
    [extraAgencyCredit],
  )
  const choice = useMemo<PaymentChoice | null>(
    () => intentToChoice(value, savedMethods, selectedSavedId, extraAgencyCredit.id),
    [value, savedMethods, selectedSavedId, extraAgencyCredit.id],
  )

  return (
    <PaymentStep
      value={choice}
      onChange={(next) => {
        if (!next) {
          onChange({ type: "hold" })
          onSelectSaved(null)
          return
        }
        if (next.type === "saved_method") {
          // A saved method is named, never carried. The token that can charge
          // it stays server-side and is resolved from this id, so nothing here
          // has to synthesize a stand-in for a credential it is not allowed to
          // hold.
          onSelectSaved(next.method.id)
          onChange({ type: "saved_method", methodId: next.method.id })
          return
        }
        onSelectSaved(null)
        if (next.type === "new_card") {
          onChange({
            type: "card",
            token: next.cardToken,
            ...(next.cardholderName ? { cardholderName: next.cardholderName } : {}),
          })
          return
        }
        if (next.type === "extra" && next.optionId === extraAgencyCredit.id) {
          onChange({ type: "ticket_on_credit" })
          return
        }
        // `hold` at the contract level — the parent's order-creation flow
        // produces a payment session + landing URL the operator shares.
        onChange({ type: "hold" })
      }}
      capabilities={capabilities ?? {}}
      savedMethods={savedMethods}
      loadingSavedMethods={loadingSavedMethods}
      extraOptions={extraOptions}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentIntent ⇄ PaymentChoice translation
// ─────────────────────────────────────────────────────────────────────────────

function intentToChoice(
  intent: PaymentIntent,
  savedMethods: SavedPaymentAccount[],
  selectedSavedId: string | null,
  agencyCreditOptionId: string,
): PaymentChoice | null {
  if (intent.type === "ticket_on_credit") {
    return { type: "extra", optionId: agencyCreditOptionId }
  }
  if (intent.type === "card") {
    if (selectedSavedId) {
      const method = savedMethods.find((m) => m.id === selectedSavedId)
      if (method) return { type: "saved_method", method }
    }
    return {
      type: "new_card",
      cardToken: intent.token,
      ...(intent.cardholderName ? { cardholderName: intent.cardholderName } : {}),
    }
  }
  return { type: "hold" }
}
