/**
 * Reusable booking-draft step components. Each takes a
 * draft + setDraft pair plus the active descriptor; updates flow up
 * via setDraft and the shell re-quotes on the next debounce tick.
 *
 * Per booking-journey-architecture §3.
 *
 * This module is a thin barrel — the implementations live in the
 * `./journey-steps/` directory, split by step. Consumers import the
 * same public symbols from here as before.
 */

export { AccommodationStep } from "./journey-steps/accommodation-step.js"
export { AddonsStep } from "./journey-steps/addons-step.js"
export { AncillariesStep } from "./journey-steps/ancillaries-step.js"
export { BillingStep } from "./journey-steps/billing-step.js"
export { DepartureStep, OptionsStep } from "./journey-steps/configure-steps.js"
export { DocumentsStep } from "./journey-steps/documents-step.js"
export { FinalizeControls, PaymentStep } from "./journey-steps/payment-step.js"
export { ReviewStep } from "./journey-steps/review-step.js"
export { deriveDefaultPhoneCountry, JourneyWarnings } from "./journey-steps/shared.js"
export { TravelersStep } from "./journey-steps/travelers-step.js"
