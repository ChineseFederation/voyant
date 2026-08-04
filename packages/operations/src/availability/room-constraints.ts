/**
 * Room constraints — the one answer to "may this traveler hold this position,
 * and is the resulting room still operable".
 *
 * Pure over already-loaded facts, exactly like `service-allocation-conflicts.ts`
 * and `service-departure-issues.ts`. Three callers share it, which is the whole
 * point:
 *
 *   - `assignTravelerAllocation` rejects a **blocking** violation unless the
 *     operator supplies an explicit `override.reason`.
 *   - `planRoomAllocation` uses the same predicates as *filters*, then relaxes
 *     them in a documented order and reports what it gave up.
 *   - `evaluateAllocationConflicts` re-runs them over the committed plan, so a
 *     violation that was overridden — or that arrived by some other route —
 *     still shows up on the screen, the CSV and the printed sheet.
 *
 * Before #4036 the only checked constraint anywhere was maximum capacity.
 * Everything else (room type, bed configuration, accessibility, the age band a
 * unit was sold under) existed as data and was consulted, at most, as a *sort
 * key* in the auto-allocator — which is to say it could be silently ignored.
 *
 * Never rename a code; add a new one. The codes are the wire contract the UI
 * translates and the audit log records.
 */

/** Stable constraint codes. Never rename one; add a new code instead. */
export type AllocationConstraintCode =
  /** The position would hold more travelers than its capacity. */
  | "capacity_exceeded"
  /** The traveler bought a different room type than this position carries. */
  | "room_type_mismatch"
  /** The position was materialized for an option unit the traveler did not buy. */
  | "unit_mismatch"
  /** The position was materialized for a product option the traveler did not buy. */
  | "option_mismatch"
  /** The traveler's bed preference cannot be met by this position's bed configuration. */
  | "bed_preference_unmet"
  /** The traveler flagged accessibility needs; the position is not marked accessible. */
  | "accessibility_unmet"
  /** The traveler's category falls outside the age band this position may hold. */
  | "age_band_excluded"
  /** The position would hold a child with no accompanying adult. */
  | "unaccompanied_minor"
  /** A child would share with adults from another booking and another sharing group. */
  | "adult_child_mixing"
  /** The position is let at a minimum occupancy it does not reach. */
  | "occupancy_below_minimum"

/**
 * `blocking` violations reject the assignment unless overridden; `advisory`
 * ones are reported and recorded but never reject.
 *
 * Accessibility is deliberately advisory. `hasAccessibilityNeeds` is derived
 * from *any* accessibility note being present on the traveler, not from a
 * declared mobility requirement, so blocking on it would make a large share of
 * perfectly ordinary rooming impossible. It is a conflict the operator must
 * see, not a wall.
 */
export type AllocationConstraintSeverity = "blocking" | "advisory"

export interface AllocationConstraintViolation {
  code: AllocationConstraintCode
  severity: AllocationConstraintSeverity
  /** English fallback for consumers with no message catalogue. */
  message: string
  /** What the position offers (a room type id, a bed configuration, a capacity). */
  expected?: string | number | null
  /** What the traveler or the resulting room actually requires. */
  actual?: string | number | null
  /** Travelers implicated beyond the one being assigned. */
  travelerIds?: string[]
}

export interface ConstraintTraveler {
  id: string
  bookingId: string
  sharingGroupId: string | null
  /** `adult` | `child` | `infant` | `senior` | `other` (bookings-contracts). */
  travelerCategory: string | null
  optionId: string | null
  optionUnitId: string | null
  roomTypeId: string | null
  bedPreference: string | null
  hasAccessibilityNeeds: boolean
}

export interface ConstraintResource {
  id: string
  kind: string
  /** Maximum occupancy. */
  capacity: number
  occupancyMin: number | null
  roomTypeId: string | null
  bedConfiguration: string | null
  accessible: boolean
  minAge: number | null
  maxAge: number | null
  refType: string | null
  refId: string | null
  flags: Record<string, unknown>
}

const SEVERITY_BY_CODE: Record<AllocationConstraintCode, AllocationConstraintSeverity> = {
  capacity_exceeded: "blocking",
  room_type_mismatch: "blocking",
  unit_mismatch: "blocking",
  option_mismatch: "blocking",
  age_band_excluded: "blocking",
  unaccompanied_minor: "blocking",
  adult_child_mixing: "blocking",
  bed_preference_unmet: "advisory",
  accessibility_unmet: "advisory",
  occupancy_below_minimum: "advisory",
}

/**
 * Flag keys that marked a resource accessible before `accessible` became a
 * column. Still honoured so rows written before #4036 keep their meaning.
 */
const LEGACY_ACCESSIBLE_FLAG_KEYS = [
  "accessible",
  "accessibilityNeeded",
  "wheelchairAccessible",
] as const

/** The age at which a traveler counts as an adult for rooming purposes. */
const ADULT_AGE = 18

/**
 * Seat-shaped kinds hold exactly one person and carry no bed, room type or
 * occupancy floor, so the room rules are meaningless for them. Only capacity,
 * unit/option matching and accessibility apply.
 */
export function isSeatShapedKind(kind: string): boolean {
  return kind === "vehicle_seat" || kind === "flight_seat"
}

export function isAccessibleResource(resource: {
  accessible?: boolean | null
  flags?: Record<string, unknown> | null
}): boolean {
  if (resource.accessible === true) return true
  const flags = resource.flags ?? {}
  return LEGACY_ACCESSIBLE_FLAG_KEYS.some((key) => flags[key] === true)
}

/**
 * Is this traveler a child for rooming purposes?
 *
 * The only non-toxic age signal available is `booking_travelers.traveler_category`.
 * A date of birth exists but lives inside `booking_traveler_travel_details.identity_encrypted`
 * — a KMS envelope. Decrypting PII to lay out a rooming plan would be a
 * significant widening of who touches traveler identity, for a signal the
 * category already carries, so the rooming plan reads the category and nothing
 * else.
 */
export function isChildCategory(category: string | null | undefined): boolean {
  return category === "child" || category === "infant"
}

export function isAdultCategory(category: string | null | undefined): boolean {
  return category === "adult" || category === "senior"
}

/** Does this position's age band admit children / adults at all? */
export function resourceAdmitsChildren(resource: ConstraintResource): boolean {
  return (resource.minAge ?? 0) < ADULT_AGE
}

export function resourceAdmitsAdults(resource: ConstraintResource): boolean {
  return resource.maxAge === null || resource.maxAge >= ADULT_AGE
}

/**
 * Can this bed configuration satisfy the traveler's stated preference?
 *
 * Deliberately permissive: `bed_configuration` is free-form supplier text, and
 * refusing to place someone because a hotel wrote "1 Queensize" rather than
 * "double" would be worse than the problem it solves. An unknown configuration
 * is treated as satisfiable — the check only fires when the text clearly names
 * a different bed shape.
 */
export function bedPreferenceSatisfied(
  preference: string | null | undefined,
  bedConfiguration: string | null | undefined,
  capacity: number,
): boolean {
  if (!preference || preference === "no-preference") return true
  const text = (bedConfiguration ?? "").toLowerCase()
  // A "single" is a request for sole occupancy, so it is decided by capacity
  // rather than by bed wording: "2 single beds" describes a twin, not a single.
  if (preference === "single") return capacity <= 1
  if (!text) return true
  // Prefix rather than whole-word matching: suppliers write "Queensize",
  // "Kingsize" and "Double bed" interchangeably, and a preference check that
  // fails on a spelling is worse than one that is slightly generous.
  if (preference === "twin") return /\btwin|\btwn\b|\b2\s*(?:x\s*)?single/.test(text)
  if (preference === "double") return /\bdouble|\bdbl\b|\bking|\bqueen|\bmatrimonial/.test(text)
  return true
}

export interface AssignmentConstraintInput {
  traveler: ConstraintTraveler
  resource: ConstraintResource
  /**
   * Who else would hold the position after this assignment lands — the current
   * occupants with the traveler being assigned already removed. The caller
   * loads them; the evaluator never queries.
   */
  otherOccupants: readonly ConstraintTraveler[]
}

/**
 * Every violation this assignment would create, blocking and advisory alike,
 * in a stable order (blocking first, then code).
 */
export function evaluateAssignmentConstraints(
  input: AssignmentConstraintInput,
): AllocationConstraintViolation[] {
  const { traveler, resource, otherOccupants } = input
  const violations: AllocationConstraintViolation[] = []
  const resulting = [...otherOccupants, traveler]

  if (resulting.length > resource.capacity) {
    violations.push(
      violation("capacity_exceeded", "This position cannot hold another traveler.", {
        expected: resource.capacity,
        actual: resulting.length,
      }),
    )
  }

  if (
    resource.refType === "option_unit" &&
    resource.refId &&
    traveler.optionUnitId &&
    resource.refId !== traveler.optionUnitId
  ) {
    violations.push(
      violation("unit_mismatch", "This position belongs to a unit the traveler did not buy.", {
        expected: resource.refId,
        actual: traveler.optionUnitId,
      }),
    )
  }

  const templateOptionId = resource.flags.templateOptionId
  if (
    typeof templateOptionId === "string" &&
    traveler.optionId &&
    templateOptionId !== traveler.optionId
  ) {
    violations.push(
      violation("option_mismatch", "This position belongs to an option the traveler did not buy.", {
        expected: templateOptionId,
        actual: traveler.optionId,
      }),
    )
  }

  if (resource.roomTypeId && traveler.roomTypeId && resource.roomTypeId !== traveler.roomTypeId) {
    violations.push(
      violation(
        "room_type_mismatch",
        "This position is a different room type than the traveler booked.",
        {
          expected: resource.roomTypeId,
          actual: traveler.roomTypeId,
        },
      ),
    )
  }

  if (traveler.hasAccessibilityNeeds && !isAccessibleResource(resource)) {
    violations.push(
      violation(
        "accessibility_unmet",
        "The traveler flagged accessibility needs and this position is not marked accessible.",
      ),
    )
  }

  if (isChildCategory(traveler.travelerCategory) && !resourceAdmitsChildren(resource)) {
    violations.push(
      violation("age_band_excluded", "This position may not hold a child.", {
        expected: resource.minAge,
        actual: traveler.travelerCategory,
      }),
    )
  }
  if (isAdultCategory(traveler.travelerCategory) && !resourceAdmitsAdults(resource)) {
    violations.push(
      violation("age_band_excluded", "This position may not hold an adult.", {
        expected: resource.maxAge,
        actual: traveler.travelerCategory,
      }),
    )
  }

  if (!isSeatShapedKind(resource.kind)) {
    if (
      !bedPreferenceSatisfied(traveler.bedPreference, resource.bedConfiguration, resource.capacity)
    ) {
      violations.push(
        violation(
          "bed_preference_unmet",
          "This position cannot meet the traveler's bed preference.",
          {
            expected: resource.bedConfiguration,
            actual: traveler.bedPreference,
          },
        ),
      )
    }
    violations.push(...evaluateOccupancyConstraints(resource, resulting))
  }

  return sortViolations(violations)
}

/**
 * Room-level rules that depend on the whole occupant set rather than on one
 * traveler: the occupancy floor and the two child-supervision rules.
 *
 * Shared with the conflicts projection so a room the operator overrode still
 * reports the same violation on the screen and the printed sheet.
 */
export function evaluateOccupancyConstraints(
  resource: ConstraintResource,
  occupants: readonly ConstraintTraveler[],
): AllocationConstraintViolation[] {
  const violations: AllocationConstraintViolation[] = []
  if (occupants.length === 0) return violations

  if (resource.occupancyMin !== null && occupants.length < resource.occupancyMin) {
    violations.push(
      violation("occupancy_below_minimum", "This position is let at a higher minimum occupancy.", {
        expected: resource.occupancyMin,
        actual: occupants.length,
        travelerIds: occupants.map((occupant) => occupant.id),
      }),
    )
  }

  const children = occupants.filter((occupant) => isChildCategory(occupant.travelerCategory))
  if (children.length === 0) return violations

  const adults = occupants.filter((occupant) => isAdultCategory(occupant.travelerCategory))
  if (adults.length === 0) {
    violations.push(
      violation(
        "unaccompanied_minor",
        "This position would hold a child with no accompanying adult.",
        {
          travelerIds: children.map((child) => child.id),
        },
      ),
    )
    return violations
  }

  // A child may share with adults from their own booking, or from a sharing
  // group the operator explicitly created. Anything else is two families in one
  // room, which is an operator decision, not a default.
  const strangers = adults.filter((adult) =>
    children.every(
      (child) =>
        adult.bookingId !== child.bookingId &&
        !(adult.sharingGroupId !== null && adult.sharingGroupId === child.sharingGroupId),
    ),
  )
  if (strangers.length > 0) {
    violations.push(
      violation(
        "adult_child_mixing",
        "A child would share this position with adults from another booking.",
        { travelerIds: [...children, ...strangers].map((occupant) => occupant.id) },
      ),
    )
  }

  return violations
}

function violation(
  code: AllocationConstraintCode,
  message: string,
  extra: {
    expected?: string | number | null
    actual?: string | number | null
    travelerIds?: string[]
  } = {},
): AllocationConstraintViolation {
  return {
    code,
    severity: SEVERITY_BY_CODE[code],
    message,
    ...(extra.expected === undefined ? {} : { expected: extra.expected }),
    ...(extra.actual === undefined ? {} : { actual: extra.actual }),
    ...(extra.travelerIds === undefined ? {} : { travelerIds: extra.travelerIds }),
  }
}

function sortViolations(
  violations: AllocationConstraintViolation[],
): AllocationConstraintViolation[] {
  return violations.sort(
    (a, b) =>
      (a.severity === "blocking" ? 0 : 1) - (b.severity === "blocking" ? 0 : 1) ||
      a.code.localeCompare(b.code),
  )
}
