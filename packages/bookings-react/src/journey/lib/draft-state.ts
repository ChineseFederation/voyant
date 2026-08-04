/**
 * Local draft-state reducers + initialization helpers.
 *
 * The journey holds the draft as a single useState at the root and
 * passes immutable views down to step components, which call the
 * supplied setter to apply patches. Per
 * booking-journey-architecture §4.
 */

import type { BookingSelectionV1 } from "@voyant-travel/catalog-contracts/booking-engine/contracts"

export type Draft = BookingSelectionV1

export interface DraftEntityIdentity {
  module: string
  id: string
  /**
   * Source kind. Empty string on the storefront before the engine's
   * server-side resolver fills it in; operator-side wiring sets
   * the real kind upfront.
   */
  sourceKind: string
  sourceConnectionId?: string
  sourceRef?: string
}

export function emptyDraft(
  entity: DraftEntityIdentity,
  defaults: { buyerType?: "B2C" | "B2B" } = {},
): Draft {
  return {
    entity,
    configure: { pax: {} },
    billing: {
      buyerType: defaults.buyerType ?? "B2C",
      contact: { firstName: "", lastName: "", email: "" },
      address: {},
    },
    travelers: [],
    addons: [],
    payment: { intent: "hold" },
  }
}

export function patchConfigure(draft: Draft, patch: Partial<Draft["configure"]>): Draft {
  return { ...draft, configure: { ...draft.configure, ...patch } }
}

export function patchBilling(draft: Draft, patch: Partial<Draft["billing"]>): Draft {
  return { ...draft, billing: { ...draft.billing, ...patch } }
}

export function setBillingBuyerType(draft: Draft, buyerType: "B2C" | "B2B"): Draft {
  if (buyerType === "B2C") {
    const { organizationId: _organizationId, company: _company, ...billing } = draft.billing
    return {
      ...draft,
      billing: {
        ...billing,
        buyerType,
        address: {},
      },
    }
  }

  return patchBilling(draft, {
    buyerType,
    contact: { firstName: "", lastName: "", email: "" },
  })
}

export function canCopyBillingContactToTraveler(contact: Draft["billing"]["contact"]): boolean {
  return Boolean(contact.firstName || contact.lastName || contact.email || contact.phone)
}

export function patchPaxCount(draft: Draft, band: string, count: number): Draft {
  const safeCount = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
  return patchConfigure(draft, {
    pax: { ...draft.configure.pax, [band]: safeCount },
  })
}

export function setTravelers(draft: Draft, travelers: Draft["travelers"]): Draft {
  return { ...draft, travelers }
}

export function setAccommodation(draft: Draft, accommodation: Draft["accommodation"]): Draft {
  return { ...draft, accommodation }
}

export function setAddons(draft: Draft, addons: Draft["addons"]): Draft {
  return { ...draft, addons }
}

export function setPayment(draft: Draft, payment: Draft["payment"]): Draft {
  return { ...draft, payment }
}

export function totalPax(draft: Draft): number {
  let total = 0
  for (const v of Object.values(draft.configure.pax ?? {})) {
    if (typeof v === "number") total += v
  }
  return total
}
