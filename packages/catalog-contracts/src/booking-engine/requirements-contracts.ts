/**
 * `BookingRequirements` — the server-published description of what a
 * booking of this target requires: steps + sub-steps, passenger bands,
 * and per-traveler + lead-only field requirements. It is returned
 * alongside a quote and tells the journey wizard which steps +
 * sub-steps to render.
 *
 * It is **server-owned** — hosts render it and never invent one.
 * Concretely, `BookingRequirementsV1` encodes:
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
 * `BookingRequirementsV1` is per-product / per-quote; the engine populates
 * it for owned rows, the adapter (or per-vertical builder) populates it
 * for sourced rows. It is **immutable per quote** — clients use it to
 * decide rendering; they never mutate it.
 *
 * Catalog plane stays neutral about per-vertical requirements
 * derivation. Each vertical exports a `build*Requirements(content, scope)`
 * function that projects its content payload into a
 * `BookingRequirementsV1`. The Booking Session lifecycle composes these
 * through the owned handler's `computeRequirements`, which the stateless
 * Offer Preview reuses; the beta `contentEnricher` hook that used to do it is
 * deleted (voyant#4188).
 *
 * The Zod schemas below are the **single source of truth** for these
 * shapes — every exported type is inferred from one of them. Runtime
 * defaults and helpers live in `requirements-defaults.ts`.
 */

import { z } from "zod"

import { ancillaryOfferGroupV1 } from "./ancillary-contracts.js"

/**
 * Versioned checkout choices shared by quote capability discovery, Commit,
 * and Commit outcomes. A host selects one of the intents advertised by the
 * active Quote; it never invents an integration-specific payment method.
 */
export const bookingCheckoutIntentV1 = z.enum([
  "hold",
  "card",
  "bank_transfer",
  "ticket_on_credit",
  "inquiry",
])
export type BookingCheckoutIntentV1 = z.infer<typeof bookingCheckoutIntentV1>

// ─────────────────────────────────────────────────────────────────
// Sub-step descriptors
// ─────────────────────────────────────────────────────────────────

/**
 * A single occupancy band — adult / child / infant or vertical-specific.
 *
 * `code` is stable; `"adult" | "child" | "infant"` are the canonical
 * three and verticals may add senior / student / etc. A product that
 * sells several tiers of one category ("Child 6-12" and "Child 0-5")
 * qualifies the second and later tiers as `child:<tierId>` so each is
 * separately countable and separately priced — see `paxBandBaseCode`.
 *
 * `minAge` / `maxAge` describe an optional age window (closed-open
 * lower, closed upper); verticals enforce it in their own validation.
 * `minCount` / `maxCount` are the count window for this band on this
 * product.
 */
export const paxBandSpecV1 = z.object({
  code: z.string(),
  label: z.string(),
  minAge: z.number().int().nonnegative().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  minCount: z.number().int().nonnegative(),
  maxCount: z.number().int().nonnegative(),
})
export type PaxBandSpecV1 = z.infer<typeof paxBandSpecV1>

/**
 * A cross-band occupancy rule (e.g. "Child under 6 requires an Adult"),
 * derived from the product's pricing-category dependencies. Both
 * `dependentCode` and `masterCode` are pax band codes.
 *
 * - `requires` — at least one `master` must be present when any
 *   `dependent` is added.
 * - `limits_per_master` — `dependent` count ≤ `master` count ×
 *   `maxPerMaster`.
 * - `limits_sum` — `dependent` count ≤ `maxDependentSum`.
 * - `excludes` — `dependent` and `master` cannot both be present.
 */
export const paxBandDependencyV1 = z.object({
  dependentCode: z.string(),
  masterCode: z.string(),
  type: z.enum(["requires", "limits_per_master", "limits_sum", "excludes"]),
  maxPerMaster: z.number().int().nonnegative().optional(),
  maxDependentSum: z.number().int().nonnegative().optional(),
})
export type PaxBandDependencyV1 = z.infer<typeof paxBandDependencyV1>

/** A cabin category sub-step option (cruises). */
export const cabinCategoryOptionV1 = z.object({
  id: z.string(),
  code: z.string().optional(),
  name: z.string(),
  type: z.string().optional(),
  capacityMin: z.number().int().nonnegative().optional(),
  capacityMax: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
})
export type CabinCategoryOptionV1 = z.infer<typeof cabinCategoryOptionV1>

/** A specific cabin / unit within a category. */
export const cabinNumberOptionV1 = z.object({
  id: z.string(),
  code: z.string().optional(),
  label: z.string(),
  capacity: z.number().int().nonnegative().optional(),
  hasAccessibilityFeatures: z.boolean().optional(),
})
export type CabinNumberOptionV1 = z.infer<typeof cabinNumberOptionV1>

/** A bookable unit under a product option / variant. */
export const productVariantUnitOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  unitType: z.string().nullable().optional(),
  minQuantity: z.number().int().nonnegative().nullable().optional(),
  maxQuantity: z.number().int().nonnegative().nullable().optional(),
})
export type ProductVariantUnitOptionV1 = z.infer<typeof productVariantUnitOptionV1>

/** A product option / variant selectable before pricing and booking. */
export const productVariantOptionV1 = z.object({
  id: z.string(),
  code: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  units: z.array(productVariantUnitOptionV1).optional(),
})
export type ProductVariantOptionV1 = z.infer<typeof productVariantOptionV1>

/**
 * A rate-plan option attached to a `RoomOptionV1` (accommodations only,
 * today). `cancellationPolicy` is a display string ("free until 7 days
 * before", "non-refundable", …); `inclusions` is free-form
 * ("breakfast", "wifi", "spa credit").
 */
export const ratePlanOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  chargeFrequency: z.enum(["per_night", "per_stay"]).optional(),
  cancellationPolicy: z.string().nullable().optional(),
  inclusions: z.array(z.string()).optional(),
  currency: z.string().optional(),
})
export type RatePlanOptionV1 = z.infer<typeof ratePlanOptionV1>

/**
 * A room option (accommodations + multi-day tours w/ rooms).
 *
 * `baseRateHint` is a per-night price hint when the upstream surfaced
 * one — pricing is volatile-live, so this is a rendering hint only.
 * `ratePlans` empty = no plan picker needed (e.g. simple multi-day-tour
 * rooms); when non-empty the journey's Accommodation step renders a
 * rate-plan dropdown per picked room.
 */
export const roomOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  capacity: z.number().int().nonnegative().nullable().optional(),
  baseRateHint: z.number().nullable().optional(),
  ratePlans: z.array(ratePlanOptionV1).optional(),
})
export type RoomOptionV1 = z.infer<typeof roomOptionV1>

/** A pre/post extension option (cruises only, today). */
export const extensionOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().nullable().optional(),
  /** Which side of the cruise it attaches to. */
  side: z.enum(["pre", "post"]),
  nights: z.number().int().nonnegative().nullable().optional(),
  pricePerPersonHint: z.number().nullable().optional(),
})
export type ExtensionOptionV1 = z.infer<typeof extensionOptionV1>

/** An add-on offer item (excursions, insurance, generic extras). */
export const addonOfferV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  /** Drives the rendering bucket. */
  kind: z.enum(["extras", "excursions", "insurance"]),
  /** Optional grouping hint (e.g. port name for cruise excursions). */
  groupKey: z.string().nullable().optional(),
  /** Pricing model — display-only. */
  pricingMode: z.string().nullable().optional(),
  /** Optional sell price hint in minor units. */
  unitAmountCents: z.number().int().nullable().optional(),
  /** Optional currency for the sell price hint. */
  currency: z.string().nullable().optional(),
  /** True when quantity is applied once per traveler. */
  pricedPerPerson: z.boolean().nullable().optional(),
  selectionType: z
    .enum(["optional", "required", "default_selected", "unavailable"])
    .nullable()
    .optional(),
  minQuantity: z.number().int().nonnegative().nullable().optional(),
  maxQuantity: z.number().int().nonnegative().nullable().optional(),
  defaultQuantity: z.number().int().nonnegative().nullable().optional(),
})
export type AddonOfferV1 = z.infer<typeof addonOfferV1>

/** Configure step sub-step union. */
export const configureSubStepV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("departure"), required: z.literal(true) }),
  z.object({ kind: z.literal("product-option"), options: z.array(productVariantOptionV1) }),
  // Inventory-unit (room/vehicle) quantity selection — payload-less; the
  // journey loads the units via an injected picker that writes
  // `configure.optionSelections`.
  z.object({ kind: z.literal("option-units") }),
  z.object({ kind: z.literal("cabin-category"), categories: z.array(cabinCategoryOptionV1) }),
  z.object({
    kind: z.literal("cabin-number"),
    perCategory: z.record(z.string(), z.array(cabinNumberOptionV1)),
  }),
  z.object({
    kind: z.literal("date-range"),
    minNights: z.number().int().positive(),
    maxNights: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("occupancy"), bands: z.array(paxBandSpecV1) }),
  z.object({
    // Air-arrangement choice for cruises (per
    // booking-journey-architecture §7). The wizard renders
    // "Cruise-line-arranged flights" / "Independent flights" /
    // "No flights" tiles. When `required` is true the user must pick
    // before advancing; "no flights" remains a valid pick.
    kind: z.literal("air-arrangement"),
    required: z.boolean().optional(),
  }),
])
export type ConfigureSubStepV1 = z.infer<typeof configureSubStepV1>

/** Accommodation step sub-step union. */
export const accommodationSubStepV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rooms"),
    options: z.array(roomOptionV1),
    sharedRoomAllowed: z.boolean(),
  }),
  z.object({
    kind: z.literal("extensions"),
    options: z.array(extensionOptionV1),
    allowsPre: z.boolean(),
    allowsPost: z.boolean(),
  }),
])
export type AccommodationSubStepV1 = z.infer<typeof accommodationSubStepV1>

/** Add-on group descriptor. */
export const addonGroupV1 = z.object({
  kind: z.enum(["extras", "excursions", "insurance"]),
  label: z.string(),
  /** Optional grouping axis — "port" or "day" for cruise excursions. */
  groupBy: z.enum(["port", "day"]).optional(),
  /** When true, each guest can pick their own selection. */
  perGuestSelection: z.boolean(),
  items: z.array(addonOfferV1),
})
export type AddonGroupV1 = z.infer<typeof addonGroupV1>

// ─────────────────────────────────────────────────────────────────
// Field requirements
// ─────────────────────────────────────────────────────────────────

/**
 * Per-traveler field requirement (PassengersSection columns).
 *
 * `key` is a stable field key — e.g. "passport", "national_id",
 * "dietary", "accessibility", "preferredLanguage". `type` is one of
 * "text" | "date" | "country" | "boolean" | "select" | … `options` are
 * for "select"-type fields. `appliesToBands` empty / undefined = all
 * bands.
 */
export const travelerFieldRequirementV1 = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  appliesToBands: z.array(z.string()).optional(),
  /** See {@link bookingFieldRequirementV1}'s `maxLength`. */
  maxLength: z.number().int().positive().optional(),
})
export type TravelerFieldRequirementV1 = z.infer<typeof travelerFieldRequirementV1>

/** Lead-only / billing-step field requirement. `group` is the render bucket. */
export const bookingFieldRequirementV1 = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  group: z.enum(["billing", "company", "preferences"]),
  /**
   * The longest value this field accepts, when it is bounded at all.
   *
   * A descriptor that says a field exists but not how wide it is leaves a
   * client unable to pre-validate even when it wants to: `address.postal` was
   * published with no length information, accepted at 25 characters by the
   * Session `PATCH`, and refused at 20 by the commit — after the card was
   * captured (voyant#4734). Publishing the bound is what lets the refusal
   * happen at the step instead.
   *
   * Optional because most fields are genuinely unbounded. Absent means "no
   * declared limit", never "unknown": the server bounds a field here whenever
   * it will bound it later.
   */
  maxLength: z.number().int().positive().optional(),
})
export type BookingFieldRequirementV1 = z.infer<typeof bookingFieldRequirementV1>

// ─────────────────────────────────────────────────────────────────
// BookingRequirements — the unified descriptor
// ─────────────────────────────────────────────────────────────────

export const bookingRequirementsV1 = z.object({
  // ── Step visibility flags ─────────────────────────────────────
  showsConfigure: z.boolean(),
  showsBilling: z.boolean(),
  showsTravelers: z.boolean(),
  showsAccommodation: z.boolean(),
  showsAddons: z.boolean(),
  /**
   * Whether anything is quoted live from a third party for this booking.
   *
   * False when no ancillary source is connected, and the step then does not
   * mount at all — no empty table, no unavailability notice. A traveller should
   * never be told about a thing the operator does not sell.
   */
  showsAncillaries: z.boolean().default(false),
  showsPayment: z.boolean(),
  /** Always true today; flagged for symmetry with the doc. */
  showsReview: z.literal(true),

  // ── Configure sub-steps ───────────────────────────────────────
  configureSubSteps: z.array(configureSubStepV1).optional(),

  // ── Passenger bands ───────────────────────────────────────────
  paxBands: z.array(paxBandSpecV1),
  /** Aggregate min/max across all bands combined. */
  paxBandsAllowedTotal: z.object({ min: z.number().int(), max: z.number().int() }),
  /**
   * Cross-band occupancy rules between pax bands — e.g. "Child under 6
   * only with at least one Adult". Evaluated by the Configure step
   * against the picked counts; empty/omitted means no constraints.
   */
  paxBandDependencies: z.array(paxBandDependencyV1).optional(),

  // ── Field requirements ────────────────────────────────────────
  travelerFields: z.array(travelerFieldRequirementV1),
  bookingFields: z.array(bookingFieldRequirementV1),

  // ── Accommodation step ────────────────────────────────────────
  accommodation: z
    .object({
      /** Top-level options. */
      roomOptions: z.array(roomOptionV1).optional(),
      sharedRoomAllowed: z.boolean(),
      /** Optional sub-step descriptors when the journey wants explicit
       *  rooms-vs-extensions sub-step granularity. */
      subSteps: z.array(accommodationSubStepV1).optional(),
    })
    .optional(),

  // ── Add-ons step ──────────────────────────────────────────────
  addons: z
    .object({
      /** Flat catalog — used by simpler verticals (extras-only products). */
      catalog: z.array(addonOfferV1).optional(),
      /** Grouped catalog — used by cruises with per-port excursions etc. */
      groups: z.array(addonGroupV1).optional(),
    })
    .optional(),

  // ── Ancillaries step ──────────────────────────────────────────
  /**
   * Live third-party offers, one group per ancillary kind. Absent when nothing
   * is connected; see `showsAncillaries`.
   */
  ancillaries: z
    .object({
      groups: z.array(ancillaryOfferGroupV1).default([]),
    })
    .optional(),

  // ── Payment ───────────────────────────────────────────────────
  paymentIntents: z.array(bookingCheckoutIntentV1),
})
export type BookingRequirementsV1 = z.infer<typeof bookingRequirementsV1>

/**
 * The requirements a fingerprint is taken over — everything except the live
 * ancillary offers.
 *
 * The descriptor is fingerprinted at Quote and re-derived at Commit, and a
 * difference supersedes the quote. That is right for everything the descriptor
 * normally carries, because those things describe what a booking *needs* and
 * only change when the operator changes something.
 *
 * Ancillary offers do not behave like that. They are priced live by a third
 * party, they carry a `validUntil` that moves on every call, and two identical
 * fan-outs a second apart legitimately differ. Including them would supersede
 * every quote the moment a traveller reached the payment step, which is not a
 * price change anyone made — it is the clock.
 *
 * `showsAncillaries` stays in the fingerprint: whether the step exists at all
 * is a stable fact about the deployment, and it changing genuinely is a
 * different booking. What the offers cost is re-confirmed at selection time
 * against the offer's own window instead.
 *
 * Mirrors `priceFingerprintInput` in `./pricing-contracts.js`.
 */
export function requirementsFingerprintInput<T>(requirements: T): T {
  if (!requirements || typeof requirements !== "object") return requirements
  const descriptor = requirements as Record<string, unknown>
  if (descriptor.ancillaries === undefined) return requirements
  const { ancillaries: _ancillaries, ...rest } = descriptor
  return rest as T
}
