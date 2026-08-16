/**
 * Shared runtime defaults and helpers for building a
 * `BookingRequirementsV1`. The shapes themselves live in
 * `requirements-contracts.ts`, which is the single source of truth —
 * this file only holds values and functions verticals reuse.
 */

import type {
  BookingFieldRequirementV1,
  BookingRequirementsV1,
  PaxBandSpecV1,
  TravelerFieldRequirementV1,
} from "./requirements-contracts.js"
import {
  BOOKING_SELECTION_BILLING_MAX_LENGTHS,
  BOOKING_SELECTION_TRAVELER_MAX_LENGTHS,
} from "./selection-contracts.js"

/**
 * Default pax bands used when a vertical doesn't supply its own.
 * Mirrors the convention surfaced in the storefront's traveler
 * widget (Adults 12+ / Children 2–11 / Infants under 2) so the
 * booking journey's age-vs-band mismatch warnings have something to
 * key off and can suggest moving a row to the right band.
 *
 * Verticals override per product when they have stricter rules
 * (e.g. cruises with senior bands, or family hotels with a
 * teenager band).
 */
export const DEFAULT_PAX_BANDS: PaxBandSpecV1[] = [
  { code: "adult", label: "Adult", minAge: 12, minCount: 1, maxCount: 8 },
  { code: "child", label: "Child", minAge: 2, maxAge: 11, minCount: 0, maxCount: 6 },
  { code: "infant", label: "Infant", maxAge: 1, minCount: 0, maxCount: 4 },
]

/** Sensible default total-pax window. Verticals override per product. */
export const DEFAULT_PAX_TOTAL = { min: 1, max: 8 } as const

/**
 * Separator between a pax band's canonical traveler category and the
 * discriminator that makes a second tier of that category addressable.
 *
 * An operator selling "Child 6-12" at one price and "Child 0-5" at
 * another needs two countable bands, but everything downstream of the
 * journey — booking traveler categories, supplier commitments, contract
 * variables — still speaks the four canonical categories. Qualifying the
 * code rather than inventing a new one keeps both true: the tier is
 * addressable, and its category is still readable off the code.
 *
 * The first tier of each category keeps the bare code, so a product with
 * one tier per category emits exactly the codes it emitted before tiers
 * existed and sessions/quotes stored against them keep resolving.
 */
export const PAX_BAND_TIER_SEPARATOR = ":"

/**
 * The canonical traveler category a band code belongs to.
 * `"child"` → `"child"`; `"child:pricing_categories_01j…"` → `"child"`.
 *
 * Read this — never the raw code — when mapping a band onto something
 * that is typed as one of the four categories.
 */
export function paxBandBaseCode(code: string): string {
  const index = code.indexOf(PAX_BAND_TIER_SEPARATOR)
  return index === -1 ? code : code.slice(0, index)
}

/**
 * Qualify a band code for a tier of an already-claimed category.
 * `tierId` is whatever identifies the tier stably for the product — the
 * pricing category id where one exists, the option unit otherwise.
 */
export function paxBandTierCode(baseCode: string, tierId: string): string {
  return `${baseCode}${PAX_BAND_TIER_SEPARATOR}${tierId}`
}

/**
 * Canonical engine-level allow list of payment intents a booking
 * exposes. This is intentionally the *full* set the engine can
 * handle — deployment/surface `PaymentProviderCapabilities` narrow it
 * further at render time (see the payment step), so listing every
 * supported intent here lets consumers opt in via capabilities without
 * needing custom requirements. Owned + sourced products both use this
 * so the storefront offers the same payment paths regardless of source.
 */
export const DEFAULT_PAYMENT_INTENTS: BookingRequirementsV1["paymentIntents"] = [
  "card",
  "bank_transfer",
  "hold",
  "inquiry",
  "ticket_on_credit",
]

/**
 * Compute the aggregate min/max from a list of pax bands. Min is the
 * sum of `minCount`; max is the sum of `maxCount`. Verticals can
 * narrow further (e.g. "max 4 cabins per booking" overrides the
 * sum-of-bands max).
 */
export function paxBandsAllowedTotalFrom(bands: readonly PaxBandSpecV1[]): {
  min: number
  max: number
} {
  let min = 0
  let max = 0
  for (const b of bands) {
    min += b.minCount
    max += b.maxCount
  }
  return { min, max }
}

/**
 * Default `showsX` flag set: configure + billing + travelers +
 * payment + review on; accommodation + add-ons off. Verticals
 * override the off-by-default flags when they have non-empty
 * accommodation / addons content.
 */
export function defaultRequirementsFlags(): Pick<
  BookingRequirementsV1,
  | "showsConfigure"
  | "showsBilling"
  | "showsTravelers"
  | "showsAccommodation"
  | "showsAddons"
  | "showsPayment"
  | "showsReview"
> {
  return {
    showsConfigure: true,
    showsBilling: true,
    showsTravelers: true,
    showsAccommodation: false,
    showsAddons: false,
    showsPayment: true,
    showsReview: true,
  }
}

/**
 * Standard traveler-field set covering the data every supplier
 * eventually wants — name, contact, age, and travel documents.
 * Verticals can override per supplier (e.g. to make a passport
 * mandatory for international cruises) or add carrier-specific
 * fields like loyalty number / meal preference.
 *
 * `appliesToBands` is honored by the wizard — DOB shows for every
 * traveler but is *required* only for child/infant bands; document
 * fields stay adult-only by default.
 */
export function defaultTravelerFields(): TravelerFieldRequirementV1[] {
  return [
    {
      key: "firstName",
      label: "First name",
      type: "text",
      required: true,
      maxLength: BOOKING_SELECTION_TRAVELER_MAX_LENGTHS.firstName,
    },
    {
      key: "lastName",
      label: "Last name",
      type: "text",
      required: true,
      maxLength: BOOKING_SELECTION_TRAVELER_MAX_LENGTHS.lastName,
    },
    { key: "email", label: "Email", type: "email", required: false },
    {
      key: "phone",
      label: "Phone",
      type: "phone",
      required: false,
      appliesToBands: ["adult", "senior", "student", "other"],
      maxLength: BOOKING_SELECTION_TRAVELER_MAX_LENGTHS.phone,
    },
    {
      key: "dateOfBirth",
      label: "Date of birth",
      type: "date",
      required: false,
    },
    {
      key: "documentType",
      label: "Document type",
      type: "select",
      required: false,
      options: [
        { value: "passport", label: "Passport" },
        { value: "national_id", label: "National ID" },
      ],
    },
    { key: "documentNumber", label: "Document number", type: "text", required: false },
    { key: "documentExpiry", label: "Document expiry", type: "date", required: false },
  ]
}

/**
 * Standard booking-fields set: contact + address. Verticals append
 * VAT / company fields for B2B flows.
 *
 * Every address line the selection carries is listed, with the width the
 * commit will hold it to. Publishing three of the six was what left
 * `address.postal` unadvertised and unbounded on the wire while the commit
 * capped it at 20 (voyant#4734): a client that wanted to pre-validate had
 * nothing to pre-validate against, and the refusal arrived after capture.
 */
export function defaultBookingFields(): BookingFieldRequirementV1[] {
  return [
    { key: "buyerType", label: "Buyer type", type: "select", required: true, group: "billing" },
    {
      key: "address.line1",
      label: "Address line 1",
      type: "text",
      required: false,
      group: "billing",
      maxLength: BOOKING_SELECTION_BILLING_MAX_LENGTHS["address.line1"],
    },
    {
      key: "address.line2",
      label: "Address line 2",
      type: "text",
      required: false,
      group: "billing",
      maxLength: BOOKING_SELECTION_BILLING_MAX_LENGTHS["address.line2"],
    },
    {
      key: "address.city",
      label: "City",
      type: "text",
      required: false,
      group: "billing",
      maxLength: BOOKING_SELECTION_BILLING_MAX_LENGTHS["address.city"],
    },
    {
      key: "address.region",
      label: "Region",
      type: "text",
      required: false,
      group: "billing",
      maxLength: BOOKING_SELECTION_BILLING_MAX_LENGTHS["address.region"],
    },
    {
      key: "address.postal",
      label: "Postal code",
      type: "text",
      required: false,
      group: "billing",
      maxLength: BOOKING_SELECTION_BILLING_MAX_LENGTHS["address.postal"],
    },
    {
      key: "address.country",
      label: "Country",
      type: "country",
      required: false,
      group: "billing",
      maxLength: BOOKING_SELECTION_BILLING_MAX_LENGTHS["address.country"],
    },
  ]
}
