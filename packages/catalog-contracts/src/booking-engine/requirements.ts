/**
 * `BookingRequirements` — the server-published description of what a
 * booking of this target requires: steps + sub-steps, passenger bands,
 * and per-traveler + lead-only field requirements. It is returned
 * alongside a quote and tells the journey wizard which steps +
 * sub-steps to render.
 *
 * It is **server-owned** — hosts render it and never invent one.
 * Concretely, `BookingRequirements` encodes:
 *   - **Step visibility flags** (`showsConfigure`, `showsAccommodation`,
 *     `showsAddons`, etc.) — whether each top-level wizard step is
 *     relevant to this product.
 *   - **Sub-step descriptors** inside Configure / Accommodation /
 *     Add-ons — which controls to render and what options to show.
 *   - **Passenger bands** (`paxBands`) — adult / child / infant
 *     constraints, drives the count steppers.
 *   - **Per-traveler + lead-only field requirements** — drives the
 *     PassengersSection / billing-step columns.
 *
 * `BookingRequirements` is per-product / per-quote; the engine populates
 * it for owned rows, the adapter (or per-vertical builder) populates it
 * for sourced rows. It is **immutable per quote** — clients use it to
 * decide rendering; they never mutate it.
 *
 * Catalog plane stays neutral about per-vertical requirements
 * derivation. Each vertical exports a `build*Requirements(content, scope)`
 * function that projects its content payload into a
 * `BookingRequirements`. The journey composes these via the
 * `contentEnricher` hook on `QuoteEntityDeps`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sub-step descriptors
// ─────────────────────────────────────────────────────────────────────────────

/** A single occupancy band — adult / child / infant or vertical-specific. */
export interface PaxBandSpec {
  /** Stable code; `"adult" | "child" | "infant"` are the canonical
   *  three. Verticals may add senior / student / etc.
   *
   *  A product that sells several tiers of one category ("Child 6-12"
   *  and "Child 0-5") qualifies the second and later tiers as
   *  `child:<tierId>` so each is separately countable and separately
   *  priced — see `paxBandBaseCode`. */
  code: string
  /** Human-readable label rendered next to the count stepper. */
  label: string
  /** Optional age window — closed-open lower, closed upper.
   *  Verticals enforce in their own validation. */
  minAge?: number
  maxAge?: number
  /** Count window for this band on this product. */
  minCount: number
  maxCount: number
}

/**
 * A cross-band occupancy rule, derived from the product's pricing-
 * category dependencies. Both `dependentCode` and `masterCode` are pax
 * band codes (e.g. "child" depends on "adult").
 *
 * - `requires` — at least one `master` must be present when any
 *   `dependent` is added.
 * - `limits_per_master` — `dependent` count ≤ `master` count ×
 *   `maxPerMaster`.
 * - `limits_sum` — `dependent` count ≤ `maxDependentSum`.
 * - `excludes` — `dependent` and `master` cannot both be present.
 */
export interface PaxBandDependency {
  dependentCode: string
  masterCode: string
  type: "requires" | "limits_per_master" | "limits_sum" | "excludes"
  maxPerMaster?: number
  maxDependentSum?: number
}

/** A cabin category sub-step option (cruises). */
export interface CabinCategoryOption {
  id: string
  code?: string
  name: string
  type?: string
  capacityMin?: number
  capacityMax?: number
  description?: string
}

/** A specific cabin / unit within a category. */
export interface CabinNumberOption {
  id: string
  code?: string
  label: string
  capacity?: number
  hasAccessibilityFeatures?: boolean
}

/** A bookable unit under a product option / variant. */
export interface ProductVariantUnitOption {
  id: string
  name: string
  description?: string | null
  unitType?: string | null
  minQuantity?: number | null
  maxQuantity?: number | null
}

/** A product option / variant selectable before pricing and booking. */
export interface ProductVariantOption {
  id: string
  code?: string | null
  name: string
  description?: string | null
  isDefault?: boolean
  units?: ReadonlyArray<ProductVariantUnitOption>
}

/** A rate-plan option attached to a `RoomOption` (accommodations only, today). */
export interface RatePlanOption {
  id: string
  name: string
  description?: string | null
  /** "per_night" | "per_stay". */
  chargeFrequency?: "per_night" | "per_stay"
  /** Cancellation policy display string ("free until 7 days before",
   *  "non-refundable", etc). */
  cancellationPolicy?: string | null
  /** Free-form inclusions ("breakfast", "wifi", "spa credit"). */
  inclusions?: ReadonlyArray<string>
  /** Currency for this plan's prices. */
  currency?: string
}

/** A room option (accommodations + multi-day tours w/ rooms). */
export interface RoomOption {
  id: string
  name: string
  description?: string | null
  capacity?: number | null
  /** Per-night base price hint, if the upstream surfaced one. Pricing
   *  is volatile-live — this is a rendering hint only. */
  baseRateHint?: number | null
  /** Rate plans bookable against this room. Empty = no plan picker
   *  needed (e.g. simple multi-day-tour rooms). When non-empty, the
   *  journey's Accommodation step renders a rate-plan dropdown per
   *  picked room. */
  ratePlans?: ReadonlyArray<RatePlanOption>
}

/** A pre/post extension option (cruises only, today). */
export interface ExtensionOption {
  id: string
  name: string
  city?: string | null
  /** "pre" | "post" — which side of the cruise it attaches to. */
  side: "pre" | "post"
  nights?: number | null
  pricePerPersonHint?: number | null
}

/** An add-on offer item (excursions, insurance, generic extras). */
export interface AddonOffer {
  id: string
  name: string
  description?: string | null
  /** "extras" | "excursions" | "insurance" — drives rendering bucket. */
  kind: "extras" | "excursions" | "insurance"
  /** Optional grouping hint (e.g. port name for cruise excursions). */
  groupKey?: string | null
  /** Pricing model — display-only. */
  pricingMode?: string | null
  /** Optional sell price hint in minor units. */
  unitAmountCents?: number | null
  /** Optional currency for the sell price hint. */
  currency?: string | null
  /** True when quantity is applied once per traveler. */
  pricedPerPerson?: boolean | null
  selectionType?: "optional" | "required" | "default_selected" | "unavailable" | null
  minQuantity?: number | null
  maxQuantity?: number | null
  defaultQuantity?: number | null
}

/** Configure step sub-step union. */
export type ConfigureSubStep =
  | { kind: "departure"; required: true }
  | { kind: "product-option"; options: ReadonlyArray<ProductVariantOption> }
  | {
      /** Inventory-unit (room / vehicle) quantity selection for the
       *  picked option + departure. The journey renders an injected
       *  units picker that writes `configure.optionSelections`. */
      kind: "option-units"
    }
  | { kind: "cabin-category"; categories: ReadonlyArray<CabinCategoryOption> }
  | { kind: "cabin-number"; perCategory: Record<string, ReadonlyArray<CabinNumberOption>> }
  | { kind: "date-range"; minNights: number; maxNights: number }
  | { kind: "occupancy"; bands: ReadonlyArray<PaxBandSpec> }
  | {
      /** Air-arrangement choice for cruises (per
       *  booking-journey-architecture §7). The wizard renders
       *  "Cruise-line-arranged flights" / "Independent flights" /
       *  "No flights" tiles. */
      kind: "air-arrangement"
      /** When true, the user must pick before advancing. Cruise
       *  lines that mandate the choice set this; "no flights"
       *  remains a valid pick. */
      required?: boolean
    }

/** Accommodation step sub-step union. */
export type AccommodationSubStep =
  | { kind: "rooms"; options: ReadonlyArray<RoomOption>; sharedRoomAllowed: boolean }
  | {
      kind: "extensions"
      options: ReadonlyArray<ExtensionOption>
      allowsPre: boolean
      allowsPost: boolean
    }

/** Add-on group descriptor. */
export interface AddonGroup {
  kind: "extras" | "excursions" | "insurance"
  label: string
  /** Optional grouping axis — "port" or "day" for cruise excursions. */
  groupBy?: "port" | "day"
  /** When true, each guest can pick their own selection. */
  perGuestSelection: boolean
  items: ReadonlyArray<AddonOffer>
}

// ─────────────────────────────────────────────────────────────────────────────
// Field requirements
// ─────────────────────────────────────────────────────────────────────────────

/** Per-traveler field requirement (PassengersSection columns). */
export interface TravelerFieldRequirement {
  /** Stable field key — e.g. "passport", "national_id", "dietary",
   *  "accessibility", "preferredLanguage". */
  key: string
  /** Render label. */
  label: string
  /** "text" | "date" | "country" | "boolean" | "select" | … */
  type: string
  required: boolean
  /** Options for "select"-type fields. */
  options?: ReadonlyArray<{ value: string; label: string }>
  /** Bands this field applies to — empty / undefined = all bands. */
  appliesToBands?: ReadonlyArray<string>
}

/** Lead-only / billing-step field requirement. */
export interface BookingFieldRequirement {
  key: string
  label: string
  type: string
  required: boolean
  /** "billing" | "company" | "preferences" — render bucket. */
  group: "billing" | "company" | "preferences"
}

// ─────────────────────────────────────────────────────────────────────────────
// BookingRequirements — the unified descriptor
// ─────────────────────────────────────────────────────────────────────────────

export interface BookingRequirements {
  // ── Step visibility flags ─────────────────────────────────────────
  showsConfigure: boolean
  showsBilling: boolean
  showsTravelers: boolean
  showsAccommodation: boolean
  showsAddons: boolean
  showsPayment: boolean
  /** Always true today; flagged for symmetry with the doc. */
  showsReview: true

  // ── Configure sub-steps ───────────────────────────────────────────
  configureSubSteps?: ReadonlyArray<ConfigureSubStep>

  // ── Passenger bands ───────────────────────────────────────────────
  paxBands: ReadonlyArray<PaxBandSpec>
  /** Aggregate min/max across all bands combined. */
  paxBandsAllowedTotal: { min: number; max: number }
  /**
   * Cross-band occupancy rules between pax bands — e.g. "Child under 6
   * only with at least one Adult". Evaluated by the Configure step
   * against the picked counts; empty/omitted means no constraints.
   */
  paxBandDependencies?: ReadonlyArray<PaxBandDependency>

  // ── Field requirements ────────────────────────────────────────────
  travelerFields: ReadonlyArray<TravelerFieldRequirement>
  bookingFields: ReadonlyArray<BookingFieldRequirement>

  // ── Accommodation step ────────────────────────────────────────────
  accommodation?: {
    /** Top-level options. */
    roomOptions?: ReadonlyArray<RoomOption>
    sharedRoomAllowed: boolean
    /** Optional sub-step descriptors when the journey wants explicit
     *  rooms-vs-extensions sub-step granularity. */
    subSteps?: ReadonlyArray<AccommodationSubStep>
  }

  // ── Add-ons step ──────────────────────────────────────────────────
  addons?: {
    /** Flat catalog — used by simpler verticals (extras-only products). */
    catalog?: ReadonlyArray<AddonOffer>
    /** Grouped catalog — used by cruises with per-port excursions etc. */
    groups?: ReadonlyArray<AddonGroup>
  }

  // ── Payment ───────────────────────────────────────────────────────
  paymentIntents: ReadonlyArray<"hold" | "card" | "bank_transfer" | "ticket_on_credit" | "inquiry">
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — shared defaults for verticals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical "adult only" pax band. Default for products / charters
 * that don't distinguish bands. Verticals override when they have
 * supplier-specific age cutoffs (cruise lines especially).
 */
/**
 * Default pax bands used when a descriptor doesn't supply its own.
 * Mirrors the convention surfaced in the storefront's traveler
 * widget (Adults 12+ / Children 2–11 / Infants under 2) so the
 * booking journey's age-vs-band mismatch warnings have something to
 * key off and can suggest moving a row to the right band.
 *
 * Verticals override per product when they have stricter rules
 * (e.g. cruises with senior bands, or family hotels with a
 * teenager band).
 */
export const DEFAULT_PAX_BANDS: ReadonlyArray<PaxBandSpec> = [
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
 * shape exposes. This is intentionally the *full* set the engine can
 * handle — deployment/surface `PaymentProviderCapabilities` narrow it
 * further at render time (see the payment step), so listing every
 * supported intent here lets consumers opt in via capabilities without
 * needing a custom shape. Owned + sourced product shapes both use this
 * so the storefront offers the same payment paths regardless of source.
 */
export const DEFAULT_PAYMENT_INTENTS: ReadonlyArray<
  "hold" | "card" | "bank_transfer" | "ticket_on_credit" | "inquiry"
> = ["card", "bank_transfer", "hold", "inquiry", "ticket_on_credit"]

/**
 * Compute the aggregate min/max from a list of pax bands. Min is the
 * sum of `minCount`; max is the sum of `maxCount`. Verticals can
 * narrow further (e.g. "max 4 cabins per booking" overrides the
 * sum-of-bands max).
 */
export function paxBandsAllowedTotalFrom(bands: ReadonlyArray<PaxBandSpec>): {
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
  BookingRequirements,
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
export function defaultTravelerFields(): ReadonlyArray<TravelerFieldRequirement> {
  return [
    { key: "firstName", label: "First name", type: "text", required: true },
    { key: "lastName", label: "Last name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: false },
    {
      key: "phone",
      label: "Phone",
      type: "phone",
      required: false,
      appliesToBands: ["adult", "senior", "student", "other"],
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
 */
export function defaultBookingFields(): ReadonlyArray<BookingFieldRequirement> {
  return [
    { key: "buyerType", label: "Buyer type", type: "select", required: true, group: "billing" },
    {
      key: "address.line1",
      label: "Address line 1",
      type: "text",
      required: false,
      group: "billing",
    },
    { key: "address.city", label: "City", type: "text", required: false, group: "billing" },
    {
      key: "address.country",
      label: "Country",
      type: "country",
      required: false,
      group: "billing",
    },
  ]
}
