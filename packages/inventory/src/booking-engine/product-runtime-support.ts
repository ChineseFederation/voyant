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
