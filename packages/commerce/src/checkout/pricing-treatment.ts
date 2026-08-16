/**
 * What the operator is allowed to do to a booking line.
 *
 * A `pass_through` line is money collected at an amount someone else set. The
 * traveller reads the booking total next to that party's own document — an
 * insurance certificate, a supplier's receipt — and the two have to agree to
 * the minor unit. A markup, a commission accrual, or a tax line inherited from
 * the operator's policy each break that agreement, and each breaks it
 * silently: nothing errors, the numbers just stop matching.
 *
 * So the exclusion is a property of the *line*, not of the rule. A rule that
 * would otherwise match must not be given the chance to; resolving "which
 * lines does this rule apply to" goes through
 * `resolveBookingItemChargeTargets` rather than each caller remembering to
 * filter. Commerce knows nothing about what is being passed through — insurance
 * is the first case and it is not named here.
 */

export const BOOKING_ITEM_PRICING_TREATMENTS = ["standard", "pass_through"] as const

export type BookingItemPricingTreatment = (typeof BOOKING_ITEM_PRICING_TREATMENTS)[number]

/**
 * The part of a booking-item row that decides how it may be priced.
 *
 * Structural rather than the full row so callers can pass a projection, a
 * planned insert, or the row itself. An absent `pricingTreatment` reads as
 * `standard`, which is what every line written before this existed is.
 */
export interface BookingItemPricingTreatmentFacts {
  pricingTreatment?: BookingItemPricingTreatment | null
  taxTreatmentCode?: string | null
}

/** True when the operator is collecting this amount rather than setting it. */
export function isPassThroughLine(
  item: BookingItemPricingTreatmentFacts | null | undefined,
): boolean {
  return item?.pricingTreatment === "pass_through"
}

/**
 * The lines an operator markup or commission may be applied to.
 *
 * Pass-through lines are absent from the result, so a caller that forgets the
 * distinction produces no charge rather than a wrong one.
 */
export function selectChargeableBookingItems<T extends BookingItemPricingTreatmentFacts>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !isPassThroughLine(item))
}

/**
 * A markup or commission rule, reduced to the only thing this module needs to
 * know about it: whether it would apply on its own terms.
 */
export interface BookingItemChargeRule<TItem> {
  id: string
  /** Whether the rule matches this line, ignoring pricing treatment entirely. */
  matches(item: TItem): boolean
}

export interface BookingItemChargeTarget<TItem> {
  ruleId: string
  item: TItem
}

/**
 * Pair each rule with the lines it may actually be applied to.
 *
 * A rule keeps its own matching logic and stays ignorant of pricing treatment;
 * the exclusion happens here, once, for every rule kind. A rule that matches
 * only a pass-through line yields no targets at all.
 */
export function resolveBookingItemChargeTargets<TItem extends BookingItemPricingTreatmentFacts>(
  items: readonly TItem[],
  rules: readonly BookingItemChargeRule<TItem>[],
): BookingItemChargeTarget<TItem>[] {
  const chargeable = selectChargeableBookingItems(items)
  const targets: BookingItemChargeTarget<TItem>[] = []
  for (const rule of rules) {
    for (const item of chargeable) {
      if (rule.matches(item)) targets.push({ ruleId: rule.id, item })
    }
  }
  return targets
}

/**
 * Raised when something tries to attach operator earnings to money the
 * operator is only collecting.
 */
export class PassThroughLineNotChargeableError extends Error {
  readonly code = "pass_through_line_not_chargeable"
  constructor(
    readonly bookingItemId: string,
    readonly charge: string,
  ) {
    super(
      `Booking item ${bookingItemId} is a pass-through line; ${charge} cannot be applied to it.`,
    )
    this.name = "PassThroughLineNotChargeableError"
  }
}

/**
 * The last line of defence for a caller that creates a charge row directly.
 *
 * `resolveBookingItemChargeTargets` is the path that keeps a rule away from a
 * pass-through line; this is for the writer that has already decided, and it
 * throws rather than dropping the row, because at that point silence would
 * hide an operator's intent instead of a rule's reach.
 */
export function assertChargeableBookingItem(
  item: BookingItemPricingTreatmentFacts & { id: string },
  charge: string,
): void {
  if (isPassThroughLine(item)) {
    throw new PassThroughLineNotChargeableError(item.id, charge)
  }
}
