/**
 * Product classification & duration resolution — the single source of truth
 * shared by the product list/detail read paths, the catalog-plane projection,
 * and the legacy Catalog search document builder.
 *
 * Three orthogonal concepts, deliberately independent of `bookingMode`,
 * `capacityMode`, `supplyModel`, and schedule:
 *
 *   1. **Product family** — a configurable merchandising classification
 *      (`tour`, `activity`, `attraction`, `event`, `transportation`) stored as
 *      a stable `code` on `product_types` and referenced by
 *      `products.productTypeId`. Standard first-party deployments seed the five
 *      families in a migration; operators may add/rename/deactivate their own.
 *
 *   2. **Product subtype** — an optional stable code on the product
 *      (`products.productSubtypeCode`), e.g. `boat-tour`, `day-tour`. Free-form
 *      and independent from the family. Never inferred from duration.
 *
 *   3. **Duration** — resolved by ONE function (`resolveProductDuration`):
 *      explicit `products.durationMinutes` first, legacy itinerary-day
 *      derivation second, otherwise `unresolved`. A legacy row with neither an
 *      explicit duration nor an itinerary — or with no family assigned — is
 *      flagged for review rather than having a classification inferred for it.
 *      A 60-minute product is a Tour if its family says so; it is never
 *      reclassified as an Activity because it is short.
 *
 * `supplyModel` stays derived from `bookingMode` per ADR-0010 and is resolved
 * elsewhere (`deriveProductSupplyModel`); it is intentionally NOT part of this
 * module.
 */

/** A standard, seeded merchandising family. */
export interface StandardProductFamily {
  /** Deterministic typeid used by the seed migration so ids are stable. */
  readonly id: string
  /** Stable code — the facet key. Never rename; add a new family instead. */
  readonly code: string
  /** Default display name (operators may override per deployment). */
  readonly name: string
  readonly description: string
  readonly sortOrder: number
}

/**
 * The five standard configurable Product families. Seeded idempotently into
 * `product_types` for standard first-party deployments (see the
 * `*_product_families` migration). Ids are fixed so the seed is stable across
 * deployments and re-runs.
 */
export const STANDARD_PRODUCT_FAMILIES = [
  {
    id: "ptyp_01kyyt22n7eddtvjwehx3pxxe2",
    code: "tour",
    name: "Tour",
    description:
      "A guided or self-guided travel experience. Day Tour and Multi-day Tour are Tour formats.",
    sortOrder: 0,
  },
  {
    id: "ptyp_01kyyt22n8ec6b4vmdyez8pezc",
    code: "activity",
    name: "Activity",
    description: "A booked thing to do — timed or open — that is not primarily a tour.",
    sortOrder: 1,
  },
  {
    id: "ptyp_01kyyt22n8ec6b4vmgjqen750d",
    code: "attraction",
    name: "Attraction",
    description: "A place of interest. Admission is the sellable Attraction entry format.",
    sortOrder: 2,
  },
  {
    id: "ptyp_01kyyt22n8ec6b4vmqk14ykvzh",
    code: "event",
    name: "Event",
    description: "A dated happening such as a show, concert, festival, or match.",
    sortOrder: 3,
  },
  {
    id: "ptyp_01kyyt22n8ec6b4vmsrekf48e1",
    code: "transportation",
    name: "Transportation",
    description: "Moving travellers from A to B — transfers, shuttles, and the like.",
    sortOrder: 4,
  },
] as const satisfies readonly StandardProductFamily[]

/** Stable family codes as a union for quick-start presets and typing. */
export type StandardProductFamilyCode = (typeof STANDARD_PRODUCT_FAMILIES)[number]["code"]

export const STANDARD_PRODUCT_FAMILY_CODES: readonly string[] = STANDARD_PRODUCT_FAMILIES.map(
  (f) => f.code,
)

/** Minutes in a day — for the legacy `durationDays` compatibility projection. */
const MINUTES_PER_DAY = 60 * 24

export type DurationProvenance = "explicit" | "itinerary-derived" | "unresolved"

export interface ResolvedDuration {
  /** Explicit resolved duration in minutes, when known. */
  minutes: number | null
  /**
   * Compatibility `durationDays`, calculated from the resolved duration:
   * from explicit minutes (rounded up, min 1) when explicit, from the itinerary
   * day count when derived, otherwise null. Kept so existing day-based
   * consumers keep working; it is never the source of classification.
   */
  days: number | null
  provenance: DurationProvenance
}

export interface ResolveDurationInput {
  /** Explicit authored duration in minutes (positive), if any. */
  durationMinutes: number | null | undefined
  /** Legacy itinerary-derived day count (max day number), if any. */
  itineraryDurationDays: number | null | undefined
}

/**
 * The one duration resolver. Explicit `durationMinutes` wins; otherwise fall
 * back to the legacy itinerary-day derivation; otherwise the duration is
 * unresolved. Never guesses a duration from booking mode or family.
 */
export function resolveProductDuration(input: ResolveDurationInput): ResolvedDuration {
  const explicit = input.durationMinutes
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
    return {
      minutes: explicit,
      days: Math.max(1, Math.ceil(explicit / MINUTES_PER_DAY)),
      provenance: "explicit",
    }
  }

  const days = input.itineraryDurationDays
  if (days != null && Number.isFinite(days) && days > 0) {
    return { minutes: null, days, provenance: "itinerary-derived" }
  }

  return { minutes: null, days: null, provenance: "unresolved" }
}

/** Reasons a product needs classification review. */
export type ClassificationReviewReason = "missing_family" | "unresolved_duration"

export interface ResolvedProductClassification {
  /** Stable family code (e.g. `tour`), or null when unclassified/dangling. */
  familyCode: string | null
  /** Resolved family display name, or null. */
  familyName: string | null
  /** Optional subtype stable code (e.g. `boat-tour`). */
  subtypeCode: string | null
  durationMinutes: number | null
  durationDays: number | null
  durationProvenance: DurationProvenance
  /** True when the product should surface an actionable review warning. */
  reviewRequired: boolean
  reviewReasons: ClassificationReviewReason[]
}

export interface ResolveClassificationInput {
  /** Resolved family from `product_types` (null when unset or dangling). */
  family: { code: string; name: string } | null
  subtypeCode: string | null | undefined
  durationMinutes: number | null | undefined
  itineraryDurationDays: number | null | undefined
}

/**
 * Resolve the full classification triple (family / subtype / duration) plus the
 * derived review state. Used identically by the read paths, the catalog-plane
 * projection, and the legacy Catalog search document so all three emit the same
 * semantics.
 */
export function resolveProductClassification(
  input: ResolveClassificationInput,
): ResolvedProductClassification {
  const duration = resolveProductDuration({
    durationMinutes: input.durationMinutes,
    itineraryDurationDays: input.itineraryDurationDays,
  })

  const reviewReasons: ClassificationReviewReason[] = []
  if (!input.family) reviewReasons.push("missing_family")
  if (duration.provenance === "unresolved") reviewReasons.push("unresolved_duration")

  return {
    familyCode: input.family?.code ?? null,
    familyName: input.family?.name ?? null,
    subtypeCode: input.subtypeCode ?? null,
    durationMinutes: duration.minutes,
    durationDays: duration.days,
    durationProvenance: duration.provenance,
    reviewRequired: reviewReasons.length > 0,
    reviewReasons,
  }
}
