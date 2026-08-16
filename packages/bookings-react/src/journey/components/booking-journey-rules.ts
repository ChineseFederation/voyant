import type {
  AncillaryOfferV1,
  AncillarySelectionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import {
  ancillaryOfferKey,
  ancillarySelectionKey,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import {
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import { type BookingsUiMessages, formatMessage } from "../../i18n/index.js"
import { type Draft, totalPax } from "../lib/draft-state.js"
import { isValidOptionalEmail } from "../lib/email-validation.js"
import { evaluatePaxBandDependencies } from "../lib/pax-band-dependencies.js"
import { findPaidScheduleRowsMissingPaymentDate } from "../lib/payment-schedule.js"
import type { JourneyStep } from "../types.js"

export function isStepVisible(step: JourneyStep, shape: BookingRequirementsV1): boolean {
  const subSteps = shape.configureSubSteps ?? []
  switch (step) {
    case "departure":
      // The departure step shows whenever the journey has a configure phase
      // (owned products always pick a departure; storefront free-date too).
      return shape.showsConfigure
    case "options":
      // The options step shows only when there's something to choose —
      // a product option, room/unit selection, or another configure
      // sub-step (cabin, date-range, air). Simple per-person tours skip it.
      return (
        shape.showsConfigure &&
        subSteps.some((s) => s.kind !== "departure" && s.kind !== "occupancy")
      )
    case "billing":
      return shape.showsBilling
    case "travelers":
      return shape.showsTravelers
    case "accommodation":
      return shape.showsAccommodation
    case "addons":
      return shape.showsAddons
    case "ancillaries":
      // Off when the deployment has no ancillary source connected. The step
      // then does not mount at all — no heading, no empty state, no notice
      // about a thing this operator does not sell.
      return shape.showsAncillaries
    case "payment":
      return shape.showsPayment
    case "documents":
      // Operator-only block; shown whenever a real booking is being finalized
      // (gated to the admin surface in the step list above).
      return shape.showsReview
    case "review":
      return shape.showsReview
  }
}

export function canAdvanceFromStep(
  step: JourneyStep,
  draft: Draft,
  shape: BookingRequirementsV1,
  _available: boolean,
): boolean {
  switch (step) {
    case "departure": {
      // Require a departure when the descriptor marks it required.
      const requiresDeparture = (shape.configureSubSteps ?? []).some(
        (s) => s.kind === "departure" && s.required,
      )
      if (!requiresDeparture) return true
      return Boolean(draft.configure.departureSlotId || draft.configure.departureDate)
    }
    case "options": {
      // Room products (an `option-units` sub-step) can't be booked — or
      // priced — without at least one room, so block confirm until one is
      // picked. Per-person products have nothing to require here.
      const isRoomProduct = (shape.configureSubSteps ?? []).some((s) => s.kind === "option-units")
      if (!isRoomProduct) return true
      const rooms = (draft.configure.optionSelections ?? []).reduce(
        (sum, s) => sum + (s.quantity ?? 0),
        0,
      )
      return rooms > 0
    }
    case "billing": {
      // B2B: the picked organization is the bill-to. The CRM org picker doesn't
      // collect an individual contact name (and the manual contact inputs are
      // hidden), so requiring one would lock the step with no way to satisfy it.
      if (draft.billing.buyerType === "B2B") {
        return (
          Boolean(draft.billing.organizationId) && isValidOptionalEmail(draft.billing.contact.email)
        )
      }
      const c = draft.billing.contact
      return (
        c.firstName.length > 0 &&
        c.lastName.length > 0 &&
        isValidOptionalEmail(c.email) &&
        (c.email.length > 0 || Boolean(c.phone?.trim()))
      )
    }
    case "travelers": {
      // Pax counts are set on this step now: require the allowed total and
      // that occupancy rules (e.g. "Child under 6 requires an Adult") hold.
      const total = totalPax(draft)
      if (total < shape.paxBandsAllowedTotal.min || total > shape.paxBandsAllowedTotal.max) {
        return false
      }
      if (
        evaluatePaxBandDependencies(draft.configure.pax, shape.paxBandDependencies, shape.paxBands)
          .length > 0
      ) {
        return false
      }
      // Hard-reject only on canonical traveler fields (firstName, lastName);
      // other required fields surface as warnings, fillable later.
      return draft.travelers.every(
        (t) => t.firstName && t.lastName && isValidOptionalEmail(t.email),
      )
    }
    case "ancillaries":
      return ancillaryDecisionsComplete(draft, shape)
    case "payment":
      return findPaidScheduleRowsMissingPaymentDate(draft.paymentSchedules) === null
    default:
      return true
  }
}

/**
 * The ancillary groups that are actually asking the traveller something.
 *
 * A group whose sources all failed carries diagnostics and no offers. There is
 * no decision to take there, so it neither renders nor holds the step — the
 * traveller is not shown a question they cannot answer.
 */
export function decidableAncillaryGroups(
  shape: BookingRequirementsV1,
): ReadonlyArray<NonNullable<BookingRequirementsV1["ancillaries"]>["groups"][number]> {
  return (shape.ancillaries?.groups ?? []).filter((group) => group.offers.length > 0)
}

/**
 * Every offered group has an EXPLICIT decision, and an accepted one is
 * answerable.
 *
 * Silence is not a decline: an empty `draft.ancillaries` means the traveller
 * has not been asked yet, and the step holds until they answer one way or the
 * other. Accepting also requires acknowledging whatever the provider marked as
 * required reading, so nobody buys before the document was reachable.
 *
 * And it requires every provider-required field, for every traveller on the
 * booking. Letting the step advance with them blank does not fail at the
 * boundary — the insurance source drops a traveller it cannot name and applies
 * for the rest, so a party of four quietly becomes a policy covering two.
 */
export function ancillaryDecisionsComplete(draft: Draft, shape: BookingRequirementsV1): boolean {
  const groups = decidableAncillaryGroups(shape)
  if (groups.length === 0) return true
  const selections = draft.ancillaries ?? []
  return groups.every((group) => {
    const selection = selections.find((entry) => entry.kind === group.kind)
    if (!selection) return false
    if (selection.decision === "declined") return true
    const offer = group.offers.find(
      (candidate) => ancillaryOfferKey(candidate) === ancillarySelectionKey(selection),
    )
    if (!offer) return false
    if (offer.eligibility.status !== "eligible") return false
    const disclosed = offer.disclosures
      .filter((disclosure) => disclosure.required)
      .every((disclosure) =>
        selection.acceptedDisclosures.some(
          (accepted) =>
            accepted.kind === disclosure.kind && accepted.versionId === disclosure.versionId,
        ),
      )
    return disclosed && ancillaryTravelerFieldsComplete(draft, offer, selection)
  })
}

/** Every required field answered, for every traveller the booking carries. */
export function ancillaryTravelerFieldsComplete(
  draft: Draft,
  offer: AncillaryOfferV1,
  selection: AncillarySelectionV1,
): boolean {
  const required = offer.requiredTravelerFields.filter((field) => field.required)
  if (required.length === 0) return true
  if (draft.travelers.length === 0) return false
  return draft.travelers.every((traveler, index) => {
    const ref = traveler.rowId ?? String(index)
    const row = selection.travelers.find((entry) => entry.ref === ref)
    if (!row) return false
    return required.every((field) => (row.fields[field.key] ?? "").trim().length > 0)
  })
}

export function validationErrorsForStep(
  step: JourneyStep,
  draft: Draft,
  messages: BookingsUiMessages,
): ReadonlyArray<string> {
  const errors: string[] = []
  switch (step) {
    case "billing":
      if (!isValidOptionalEmail(draft.billing.contact.email)) {
        errors.push(messages.bookingJourney.validation.invalidEmail)
      }
      break
    case "travelers":
      if (draft.travelers.some((t) => !isValidOptionalEmail(t.email))) {
        errors.push(messages.bookingJourney.validation.invalidEmail)
      }
      break
  }
  return errors
}

/**
 * Completeness for the stacked admin accordion's AUTO-advance — stricter
 * than `canAdvanceFromStep` so the flow pauses on sections that need a
 * deliberate choice even though they're not hard-required to commit:
 *  - options: a product option must be picked (when the product has them);
 *  - payment: an intent must be chosen.
 * Everything else defers to the shared gate. Kept separate so the wizard's
 * Next gating (which uses `canAdvanceFromStep`) is unchanged.
 */
export function stackedStepComplete(
  step: JourneyStep,
  draft: Draft,
  shape: BookingRequirementsV1,
  available: boolean,
): boolean {
  switch (step) {
    case "options": {
      const hasOptions = (shape.configureSubSteps ?? []).some((s) => s.kind === "product-option")
      // No options to choose → nothing to wait for. Otherwise require a pick.
      return hasOptions ? Boolean(draft.configure.variantId) : true
    }
    case "payment":
      return (
        Boolean(draft.payment.intent) &&
        findPaidScheduleRowsMissingPaymentDate(draft.paymentSchedules) === null
      )
    default:
      return canAdvanceFromStep(step, draft, shape, available)
  }
}

/**
 * Soft warnings for the current step — surfaced inline above the
 * Next button. Don't block advancement; they're hints. Per
 * booking-journey-architecture §12.5.
 *
 * The hard-reject path stays in `canAdvanceFromStep` for fields
 * that are physically required to commit (e.g. traveler names);
 * everything else is a warning here.
 */
export function warningsForStep(
  step: JourneyStep,
  draft: Draft,
  shape: BookingRequirementsV1,
  messages: BookingsUiMessages,
): ReadonlyArray<string> {
  const warnings: string[] = []
  switch (step) {
    case "billing": {
      const c = draft.billing.contact
      if (c.phone == null || c.phone.length === 0) {
        warnings.push(messages.bookingJourney.warnings.phoneMissing)
      }
      if (!draft.billing.address.country) {
        warnings.push(messages.bookingJourney.warnings.billingCountryMissing)
      }
      if (draft.billing.buyerType === "B2B" && !draft.billing.company?.vatId) {
        warnings.push(messages.bookingJourney.warnings.vatMissing)
      }
      break
    }
    case "travelers": {
      const requiredKeys = shape.travelerFields.filter((f) => f.required).map((f) => f.key)
      const skipBaseline = new Set(["firstName", "lastName"])
      const optionalRequired = requiredKeys.filter((k) => !skipBaseline.has(k))
      for (const t of draft.travelers) {
        for (const key of optionalRequired) {
          const docs = t.documents ?? {}
          // Email is on the row directly; everything else lives in
          // the document map.
          const value = key === "email" ? t.email : (docs as Record<string, unknown>)[key]
          if (value == null || value === "") {
            const traveler =
              `${t.firstName || messages.bookingJourney.steps.travelers} ${t.lastName || ""}`.trim()
            warnings.push(
              formatMessage(messages.bookingJourney.warnings.travelerFieldRequired, {
                traveler,
                field: labelForFieldKey(key, shape),
              }),
            )
          }
        }
      }
      break
    }
    case "payment": {
      if (findPaidScheduleRowsMissingPaymentDate(draft.paymentSchedules) !== null) {
        warnings.push(messages.bookingJourney.validation.paidPaymentDateRequired)
      }
      break
    }
    case "review": {
      if (findPaidScheduleRowsMissingPaymentDate(draft.paymentSchedules) !== null) {
        warnings.push(messages.bookingJourney.validation.paidPaymentDateRequired)
      }
      if (!draft.payment.intent) {
        warnings.push(messages.bookingJourney.warnings.paymentIntentMissing)
      }
      if (draft.travelers.length === 0) {
        warnings.push(messages.bookingJourney.warnings.noTravelers)
      }
      break
    }
  }
  return warnings
}

function labelForFieldKey(key: string, shape: BookingRequirementsV1): string {
  return shape.travelerFields.find((f) => f.key === key)?.label ?? key
}

/**
 * Compose a stable signature off the inputs the hold cares about.
 * Includes entity + slot + pax so any change re-issues the hold;
 * excludes billing / traveler details so cosmetic edits don't
 * thrash the inventory layer.
 */
export function makeHoldSignature(
  draft: Draft,
  entityModule: string,
  entityId: string,
): string | null {
  const slot = draft.configure.departureSlotId
  if (!slot) return null
  const pax = totalPax(draft)
  if (pax <= 0) return null
  return `${entityModule}/${entityId}/${slot}/${pax}`
}

export function defaultMinimalShape(): BookingRequirementsV1 {
  return {
    ...defaultRequirementsFlags(),
    paxBands: DEFAULT_PAX_BANDS,
    paxBandsAllowedTotal: paxBandsAllowedTotalFrom(DEFAULT_PAX_BANDS),
    travelerFields: defaultTravelerFields(),
    bookingFields: defaultBookingFields(),
    // Engine-level allow list. Capabilities (per-deployment toggles)
    // narrow further at render time — listing every supported intent
    // here means consumers can opt in via PaymentProviderCapabilities
    // without needing a custom fallbackShape.
    paymentIntents: DEFAULT_PAYMENT_INTENTS,
  }
}
