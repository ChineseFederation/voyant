/**
 * Pure, transport-agnostic logic for mapping travelers onto option_units
 * at booking-create time. Lives in `@voyant-travel/bookings` so the
 * booking-create dialog (preview + submit) is the only call site today,
 * but the server can import the same module to validate or re-resolve
 * submit payloads in a follow-up — that wiring is not yet in place.
 *
 * Vocabulary:
 *   - A **pricing tier** (`unit_type='person'`) is a per-pax price band
 *     a traveler is billed as (Adult / Child 6-12 / Infant 0-5 / …).
 *   - An **inventory unit** (`'room' | 'vehicle' | 'seat'`) is a finite
 *     container a traveler is placed into (one DBL room holds 2 pax).
 *   - "Person-priced options" are options that only have pricing tiers
 *     (no inventory). Excursions. For these, line-item quantities
 *     **derive from the traveler list** (1 adult + 1 child + 1 infant).
 *   - "Accommodation options" have inventory units (and usually a
 *     paired person unit for per-pax fees). For these, line-item
 *     quantities **stay as the operator picked them** (1 DBL room is
 *     still 1 line, not 2).
 *
 * The `pricingUnitSource` and `inventoryUnitSource` enums on the
 * traveler track operator intent so the resolver knows when to
 * re-derive ("auto") versus respect an explicit choice ("manual" /
 * "none" for No room).
 *
 * No React, no DB, no HTTP — just the assignment math.
 *
 * Tracking: voyant-travel/voyant#1267.
 */

export type TravelerRole = "lead" | "adult" | "child" | "infant"
export type AssignmentRoleHint = "adult" | "child" | "infant"
export type BookingDraftUnitAssignmentSource = "auto" | "manual" | "none"

export interface BookingDraftTraveler {
  /** Stable client-side traveler key used by wire-format travelerKeys links. */
  clientTravelerKey?: string | null
  personId: string | null
  firstName: string
  lastName: string
  email: string
  phone: string
  preferredLanguage: string
  role: TravelerRole
  dateOfBirth: string | null
  /** option_unit_id of the person pricing tier this traveler is billed as. */
  pricingUnitId: string | null
  /** option_unit_id of the room/vehicle this traveler occupies, when applicable. */
  inventoryUnitId: string | null
  /**
   * Tracks operator intent around `pricingUnitId`.
   *
   * - `auto`: derived from product shape, DOB, role hints, and
   *   selected quantity. Eligible for re-derivation on every render.
   * - `manual`: operator explicitly clicked a category button. The
   *   resolver respects the value when it's in the current unit set;
   *   otherwise it re-derives.
   * - `none`: no pricing unit should be assigned.
   */
  pricingUnitSource?: BookingDraftUnitAssignmentSource
  /**
   * Tracks operator intent around `inventoryUnitId`.
   *
   * - `auto`: derived from selected quantity and product shape.
   * - `manual`: operator explicitly clicked a room/vehicle control.
   * - `none`: operator explicitly picked "No room". Stays null.
   */
  inventoryUnitSource?: BookingDraftUnitAssignmentSource
}

export interface PricingAssignmentUnit {
  /** Option the unit belongs to. Null for product-level units. */
  optionId?: string | null
  /** Stable id of the unit (option_unit primary key). */
  optionUnitId: string
  /** Display name (e.g. "Adult", "Child 6-12", "DBL room"). */
  unitName: string
  /** Stable code from the products schema (`ADULT`, `child_6_12`, …) when present. */
  unitCode?: string | null
  /** Inclusive lower age bound for this unit, when configured. */
  minAge?: number | null
  /** Inclusive upper age bound for this unit, when configured. */
  maxAge?: number | null
  /** Unit category — drives the pricing-tier vs inventory split. */
  unitType?: "person" | "group" | "room" | "vehicle" | "service" | "other" | null
  /** Maximum travelers held by one selected inventory unit. */
  occupancyMax?: number | null
}

export type BookingDraftQuantities = Record<string, number>

export interface ResolvedBookingDraft<TTraveler extends BookingDraftTraveler> {
  quantities: BookingDraftQuantities
  travelers: TTraveler[]
  /**
   * For each unit that ended up assigned, the indexes (into the input
   * traveler array) of travelers mapped to it. Used at submit time to
   * stamp stable `travelerKeys` on `booking_item` lines so the server
   * can link items to travelers through `booking_item_travelers`.
   */
  travelerIndexesByUnitId: Record<string, number[]>
}

/**
 * Minimal structural shape `resolveBookingExtraLines` needs from an
 * extra line. Real callers (booking-create dialog) pass the full
 * `BookingCreateExtraLineInput` from `@voyant-travel/bookings-react`; this
 * type avoids a cyclic dependency.
 */
export interface ResolvableExtraLine {
  productExtraId: string
  pricingMode?: string | null
  pricedPerPerson?: boolean | null
  quantity: number
  unitSellAmountCents?: number | null
  totalSellAmountCents?: number | null
  clientLineKey?: string | null
  travelerKeys?: string[] | null
  travelerIndexes?: number[] | null
}
