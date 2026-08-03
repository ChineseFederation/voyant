import { paxBandTierCode } from "@voyant-travel/catalog/booking-engine"

/**
 * Traveler categories the journey renders as pax bands. `group`, `room`,
 * `vehicle`, `service` and `other` pricing categories are inventory
 * units, not people.
 */
export const TRAVELER_CATEGORY_TYPES: ReadonlySet<string> = new Set([
  "adult",
  "child",
  "infant",
  "senior",
])

/** A product's traveler category, reduced to what band derivation needs. */
export interface TravelerCategoryRow {
  id: string
  name: string
  categoryType: string
  minAge: number | null
  maxAge: number | null
  internalUseOnly: boolean
}

/**
 * Assign each of a product's traveler categories the pax-band code that
 * identifies it, given the product's categories in the operator's own
 * order.
 *
 * The first category of a type keeps the bare `categoryType`, so a
 * product with one "Adult" and one "Child" emits `adult` / `child`
 * exactly as it did before tiers existed — stored sessions, accepted
 * quote breakdowns and traveler rows keyed on those codes keep
 * resolving, and the tier that used to win a contested band by sort
 * order is still the one that answers to the bare code.
 *
 * Every further category of the same type is qualified by its id, which
 * is what makes "Child 0-5" separately countable and separately priced
 * instead of unreachable behind "Child 6-12" (voyant#4121).
 *
 * Categories that are not traveler types, or are internal-use-only, get
 * no code: the journey never offers them, so nothing may key on them.
 *
 * Callers must pass the product's full category list, not a subset —
 * the price resolver and the band loader each build this map from their
 * own query, and they only agree if both see the same ordered input.
 */
export function paxBandCodesByCategoryId(
  categories: ReadonlyArray<TravelerCategoryRow>,
): Map<string, string> {
  const claimed = new Set<string>()
  const codes = new Map<string, string>()
  for (const category of categories) {
    if (category.internalUseOnly) continue
    if (!TRAVELER_CATEGORY_TYPES.has(category.categoryType)) continue
    const base = category.categoryType
    const code = claimed.has(base) ? paxBandTierCode(base, category.id) : base
    claimed.add(base)
    codes.set(category.id, code)
  }
  return codes
}

/**
 * Map an `optionUnits` row to one of the booking-engine's pax-band
 * codes. Operators don't tag units with explicit categories; the
 * mapping is derived from age windows. Heuristic:
 *
 *   - non-person units → null (rooms / vehicles / services don't
 *     participate in per-pax pricing)
 *   - `maxAge ≤ 1` → `infant`
 *   - `maxAge ≤ 17` → `child` (covers operators who tag teens as
 *     "Child 6-12" or similar — the booking engine still treats them
 *     as the child band)
 *   - otherwise → `adult`
 *
 * `senior` requires an explicit pax band, which the default
 * `DEFAULT_PAX_BANDS` does not include — operators that need it
 * extend the bands per product.
 */
export function deriveTravelerCategory(unit: {
  unitType: string
  minAge: number | null
  maxAge: number | null
}): "adult" | "child" | "infant" | "senior" | null {
  if (unit.unitType !== "person") return null
  if (unit.maxAge !== null && unit.maxAge <= 1) return "infant"
  if (unit.maxAge !== null && unit.maxAge <= 17) return "child"
  return "adult"
}

export function humanizeFieldKey(key: string): string {
  switch (key) {
    case "first_name":
      return "First name"
    case "last_name":
      return "Last name"
    case "date_of_birth":
      return "Date of birth"
    case "passport_number":
      return "Passport number"
    case "passport_expiry":
      return "Passport expiry"
    case "dietary_requirements":
      return "Dietary requirements"
    case "accessibility_needs":
      return "Accessibility needs"
    case "special_requests":
      return "Special requests"
    default:
      return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  }
}

export function typeForFieldKey(key: string): string {
  switch (key) {
    case "date_of_birth":
    case "passport_expiry":
      return "date"
    case "email":
      return "email"
    case "phone":
      return "phone"
    case "address":
      return "text"
    default:
      return "text"
  }
}
